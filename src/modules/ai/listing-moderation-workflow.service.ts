import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalStatus, NotificationType } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  AiModerationService,
  ModerationEvaluationError,
} from './ai-moderation.service';
import { ModerationAuditService } from './moderation-audit.service';
import {
  ListingModerationInput,
  ModerationWorkflowResult,
} from './moderation.types';

@Injectable()
export class ListingModerationWorkflowService {
  private readonly logger = new Logger(ListingModerationWorkflowService.name);
  private readonly enabled = process.env.AI_MODERATION_ENABLED === 'true';
  private readonly autoApproveConfidenceMin = Number.parseFloat(
    process.env.AI_AUTO_APPROVE_CONFIDENCE_MIN ?? '0.85',
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly aiModerationService: AiModerationService,
    private readonly moderationAuditService: ModerationAuditService,
  ) {}

  isEnabled() {
    return this.enabled;
  }

  async runForListing(listingId: string): Promise<ModerationWorkflowResult> {
    if (!this.enabled) {
      throw new BadRequestException('AI moderation is disabled');
    }

    const input = await this.loadModerationInput(listingId);

    try {
      const result = await this.aiModerationService.evaluateListing(input);
      const shouldAutoApprove =
        result.riskLevel === 'LOW' &&
        result.confidence >= this.autoApproveConfidenceMin &&
        result.violations.length === 0 &&
        result.recommendedAction === 'APPROVE';
      const appliedAction = shouldAutoApprove ? 'APPROVED' : 'PENDING';

      const run = await this.moderationAuditService.createSuccess({
        listingId,
        model: result.model,
        inputHash: result.inputHash,
        riskLevel: result.riskLevel,
        confidence: result.confidence,
        violations: result.violations,
        summary: result.summary,
        recommendedAction: result.recommendedAction,
        appliedAction,
        processingMs: result.processingMs,
      });

      if (shouldAutoApprove) {
        await this.approveListing(listingId);
      }

      return {
        moderation: this.moderationAuditService.mapRunToView(run)!,
        appliedAction: appliedAction === 'APPROVED' ? 'approved' : 'pending',
        status: 'success',
      };
    } catch (error) {
      const failure =
        error instanceof ModerationEvaluationError
          ? error
          : new ModerationEvaluationError(
              error instanceof Error ? error.message : 'AI moderation failed',
              'UNKNOWN',
              0,
              this.aiModerationService.getModelName(),
            );
      this.logger.error(
        `AI moderation failed for listing ${listingId} (${failure.failureType}) after ${failure.processingMs}ms: ${failure.message}`,
      );
      const run = await this.moderationAuditService.createError({
        listingId,
        model: failure.model,
        inputHash: this.aiModerationService.buildInputHash(input),
        processingMs: failure.processingMs,
        failureType: failure.failureType,
        errorMessage: failure.message,
      });

      return {
        moderation: this.moderationAuditService.mapRunToView(run)!,
        appliedAction: 'pending',
        status: 'error',
        failureType: failure.failureType,
        errorMessage: failure.message,
      };
    }
  }

  async approveListing(id: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });
    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.approvalStatus === ApprovalStatus.APPROVED) {
      return listing;
    }

    const updated = await this.prisma.listing.update({
      where: { id },
      data: { approvalStatus: ApprovalStatus.APPROVED },
    });

    await this.notificationsService.create(
      updated.sellerId,
      NotificationType.LISTING_APPROVED,
      'Listing approved',
      `Your listing "${updated.title}" has been approved.`,
      {
        listingId: updated.id,
      },
    );

    return updated;
  }

  async rejectListing(id: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });
    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.approvalStatus === ApprovalStatus.REJECTED) {
      return listing;
    }

    const updated = await this.prisma.listing.update({
      where: { id },
      data: { approvalStatus: ApprovalStatus.REJECTED },
    });

    await this.notificationsService.create(
      updated.sellerId,
      NotificationType.LISTING_REJECTED,
      'Listing rejected',
      `Your listing "${updated.title}" has been rejected.`,
      {
        listingId: updated.id,
      },
    );

    return updated;
  }

  private async loadModerationInput(
    listingId: string,
  ): Promise<ListingModerationInput> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: {
        category: true,
      },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    return {
      id: listing.id,
      title: listing.title,
      description: listing.description,
      category: listing.category.slug,
      department: listing.department?.toLowerCase(),
    };
  }
}
