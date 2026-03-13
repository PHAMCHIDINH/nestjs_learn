import { Injectable, Logger } from '@nestjs/common';
import { ModerationJobStatus } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { ModerationJobStatusView } from './moderation.types';

type ClaimedModerationJob = {
  id: string;
  listingId: string;
  attemptCount: number;
  revision: number;
};

@Injectable()
export class ListingModerationJobService {
  private readonly logger = new Logger(ListingModerationJobService.name);
  private readonly enabled = process.env.AI_MODERATION_ENABLED === 'true';
  private readonly maxAttempts = 3;
  private readonly staleRunMs = 90_000;
  private readonly retryBackoffMs = [15_000, 30_000, 60_000];

  constructor(private readonly prisma: PrismaService) {}

  isEnabled() {
    return this.enabled;
  }

  async enqueue(
    listingId: string,
    options?: { preserveRunning?: boolean },
  ): Promise<ModerationJobStatusView> {
    const now = new Date();

    const job = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.listingModerationJob.findUnique({
        where: { listingId },
      });

      if (!existing) {
        return tx.listingModerationJob.create({
          data: {
            listingId,
            status: ModerationJobStatus.PENDING,
            nextRunAt: now,
          },
        });
      }

      if (
        options?.preserveRunning &&
        existing.status === ModerationJobStatus.RUNNING
      ) {
        return existing;
      }

      return tx.listingModerationJob.update({
        where: { listingId },
        data: {
          status: ModerationJobStatus.PENDING,
          revision: { increment: 1 },
          attemptCount: 0,
          nextRunAt: now,
          lastError: null,
        },
      });
    });

    this.logger.log(`Queued moderation job for listing ${listingId}`);

    return this.mapStatus(job.status);
  }

  async getStatusForListing(
    listingId: string,
  ): Promise<ModerationJobStatusView | undefined> {
    const job = await this.prisma.listingModerationJob.findUnique({
      where: { listingId },
      select: { status: true },
    });

    return job ? this.mapStatus(job.status) : undefined;
  }

  async claimNextJob(): Promise<ClaimedModerationJob | null> {
    if (!this.enabled) {
      return null;
    }

    await this.recoverStaleJobs();

    const now = new Date();
    const candidate = await this.prisma.listingModerationJob.findFirst({
      where: {
        status: ModerationJobStatus.PENDING,
        nextRunAt: { lte: now },
      },
      orderBy: [{ nextRunAt: 'asc' }, { createdAt: 'asc' }],
    });

    if (!candidate) {
      return null;
    }

    const claimResult = await this.prisma.listingModerationJob.updateMany({
      where: {
        id: candidate.id,
        status: ModerationJobStatus.PENDING,
        revision: candidate.revision,
      },
      data: {
        status: ModerationJobStatus.RUNNING,
        attemptCount: { increment: 1 },
        lastError: null,
      },
    });

    if (claimResult.count === 0) {
      return null;
    }

    const claimed = await this.prisma.listingModerationJob.findUniqueOrThrow({
      where: { id: candidate.id },
      select: {
        id: true,
        listingId: true,
        attemptCount: true,
        revision: true,
      },
    });

    return claimed;
  }

  async complete(job: ClaimedModerationJob) {
    const result = await this.prisma.listingModerationJob.updateMany({
      where: {
        id: job.id,
        revision: job.revision,
        status: ModerationJobStatus.RUNNING,
      },
      data: {
        status: ModerationJobStatus.COMPLETED,
        nextRunAt: new Date(),
        lastError: null,
      },
    });

    if (result.count === 0) {
      this.logger.warn(
        `Skipped completing stale moderation job ${job.id} for listing ${job.listingId}`,
      );
    }
  }

  async fail(job: ClaimedModerationJob, errorMessage: string) {
    const result = await this.prisma.listingModerationJob.updateMany({
      where: {
        id: job.id,
        revision: job.revision,
        status: ModerationJobStatus.RUNNING,
      },
      data: {
        status: ModerationJobStatus.FAILED,
        nextRunAt: new Date(),
        lastError: errorMessage,
      },
    });

    if (result.count === 0) {
      this.logger.warn(
        `Skipped failing stale moderation job ${job.id} for listing ${job.listingId}`,
      );
    }
  }

  async retry(job: ClaimedModerationJob, errorMessage: string) {
    if (job.attemptCount >= this.maxAttempts) {
      await this.fail(job, errorMessage);
      return;
    }

    const delayMs =
      this.retryBackoffMs[job.attemptCount - 1] ??
      this.retryBackoffMs[this.retryBackoffMs.length - 1];
    const nextRunAt = new Date(Date.now() + delayMs);

    const result = await this.prisma.listingModerationJob.updateMany({
      where: {
        id: job.id,
        revision: job.revision,
        status: ModerationJobStatus.RUNNING,
      },
      data: {
        status: ModerationJobStatus.PENDING,
        nextRunAt,
        lastError: errorMessage,
      },
    });

    if (result.count === 0) {
      this.logger.warn(
        `Skipped retrying stale moderation job ${job.id} for listing ${job.listingId}`,
      );
      return;
    }

    this.logger.warn(
      `Retrying moderation job ${job.id} for listing ${job.listingId} in ${delayMs}ms`,
    );
  }

  private async recoverStaleJobs() {
    const staleBefore = new Date(Date.now() - this.staleRunMs);
    const result = await this.prisma.listingModerationJob.updateMany({
      where: {
        status: ModerationJobStatus.RUNNING,
        updatedAt: { lt: staleBefore },
      },
      data: {
        status: ModerationJobStatus.PENDING,
        revision: { increment: 1 },
        nextRunAt: new Date(),
        lastError: 'Recovered stale moderation job',
      },
    });

    if (result.count > 0) {
      this.logger.warn(`Recovered ${result.count} stale moderation jobs`);
    }
  }

  private mapStatus(status: ModerationJobStatus): ModerationJobStatusView {
    switch (status) {
      case ModerationJobStatus.PENDING:
        return 'pending';
      case ModerationJobStatus.RUNNING:
        return 'running';
      case ModerationJobStatus.COMPLETED:
        return 'completed';
      case ModerationJobStatus.FAILED:
      default:
        return 'failed';
    }
  }
}
