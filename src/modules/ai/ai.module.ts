import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AiModerationService } from './ai-moderation.service';
import { ListingModerationJobService } from './listing-moderation-job.service';
import { ListingModerationWorkerService } from './listing-moderation-worker.service';
import { ListingModerationWorkflowService } from './listing-moderation-workflow.service';
import { ModerationAuditService } from './moderation-audit.service';
import { ModerationPolicyService } from './moderation-policy.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [
    AiModerationService,
    ListingModerationJobService,
    ListingModerationWorkerService,
    ListingModerationWorkflowService,
    ModerationAuditService,
    ModerationPolicyService,
  ],
  exports: [
    AiModerationService,
    ListingModerationJobService,
    ListingModerationWorkflowService,
    ModerationAuditService,
  ],
})
export class AiModule {}
