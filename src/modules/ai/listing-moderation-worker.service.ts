import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ListingModerationJobService } from './listing-moderation-job.service';
import { ListingModerationWorkflowService } from './listing-moderation-workflow.service';

@Injectable()
export class ListingModerationWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ListingModerationWorkerService.name);
  private readonly pollIntervalMs = 5_000;
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly listingModerationJobService: ListingModerationJobService,
    private readonly listingModerationWorkflowService: ListingModerationWorkflowService,
  ) {}

  onModuleInit() {
    if (
      !this.listingModerationJobService.isEnabled() ||
      process.env.NODE_ENV === 'test'
    ) {
      return;
    }

    this.timer = setInterval(() => {
      void this.poll();
    }, this.pollIntervalMs);

    void this.poll();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async poll() {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      for (let index = 0; index < 5; index += 1) {
        const job = await this.listingModerationJobService.claimNextJob();
        if (!job) {
          break;
        }

        await this.processJob(job);
      }
    } finally {
      this.running = false;
    }
  }

  private async processJob(
    job: Awaited<ReturnType<ListingModerationJobService['claimNextJob']>>,
  ) {
    if (!job) {
      return;
    }

    try {
      const result = await this.listingModerationWorkflowService.runForListing(
        job.listingId,
      );

      if (
        result.status === 'error' &&
        (result.failureType === 'TIMEOUT' || result.failureType === 'PROVIDER')
      ) {
        await this.listingModerationJobService.retry(
          job,
          result.errorMessage ?? 'AI moderation retry scheduled',
        );
        return;
      }

      if (result.status === 'error') {
        await this.listingModerationJobService.fail(
          job,
          result.errorMessage ??
            (result.failureType
              ? `AI moderation failed with ${result.failureType}`
              : 'AI moderation failed'),
        );
        return;
      }

      await this.listingModerationJobService.complete(job);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'AI moderation job failed';
      this.logger.error(
        `Moderation worker crashed for listing ${job.listingId}: ${message}`,
      );
      await this.listingModerationJobService.retry(job, message);
    }
  }
}
