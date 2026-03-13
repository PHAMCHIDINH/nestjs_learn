import { NotificationsService } from '../notifications/notifications.service';
import { AiModerationService } from './ai-moderation.service';
import { ListingModerationWorkflowService } from './listing-moderation-workflow.service';
import { ModerationAuditService } from './moderation-audit.service';

describe('ListingModerationWorkflowService', () => {
  const listingSnapshot = {
    id: 'listing-1',
    title: 'Giao trinh Java',
    description: 'Sach con moi, noi dung hoc tap ro rang.',
    category: { slug: 'textbook' },
    department: 'CNTT',
  };

  let prisma: {
    listing: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let notificationsService: Pick<NotificationsService, 'create'>;
  let aiModerationService: Pick<
    AiModerationService,
    'evaluateListing' | 'buildInputHash' | 'getModelName'
  >;
  let moderationAuditService: Pick<
    ModerationAuditService,
    'createSuccess' | 'createError' | 'mapRunToView'
  >;

  beforeEach(() => {
    process.env.AI_MODERATION_ENABLED = 'true';
    process.env.AI_AUTO_APPROVE_CONFIDENCE_MIN = '0.85';

    prisma = {
      listing: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    notificationsService = {
      create: jest.fn(),
    };
    aiModerationService = {
      evaluateListing: jest.fn(),
      buildInputHash: jest.fn().mockReturnValue('hash-1'),
      getModelName: jest.fn().mockReturnValue('openrouter/test-model'),
    };
    moderationAuditService = {
      createSuccess: jest.fn(),
      createError: jest.fn(),
      mapRunToView: jest.fn(),
    };
  });

  it('auto approves low risk listings', async () => {
    prisma.listing.findUnique
      .mockResolvedValueOnce(listingSnapshot)
      .mockResolvedValueOnce({
        id: 'listing-1',
        sellerId: 'user-1',
        title: listingSnapshot.title,
        approvalStatus: 'PENDING',
      });
    prisma.listing.update.mockResolvedValue({
      id: 'listing-1',
      sellerId: 'user-1',
      title: listingSnapshot.title,
      approvalStatus: 'APPROVED',
    });
    (aiModerationService.evaluateListing as jest.Mock).mockResolvedValue({
      inputHash: 'hash-1',
      model: 'openrouter/test-model',
      riskLevel: 'LOW',
      confidence: 0.91,
      violations: [],
      summary: 'No obvious violation.',
      recommendedAction: 'APPROVE',
      processingMs: 1200,
    });
    (moderationAuditService.createSuccess as jest.Mock).mockResolvedValue({
      riskLevel: 'LOW',
      confidence: 0.91,
      recommendedAction: 'APPROVE',
      summary: 'No obvious violation.',
      violationsJson: [],
      createdAt: new Date('2026-03-13T00:00:00.000Z'),
    });
    (moderationAuditService.mapRunToView as jest.Mock).mockReturnValue({
      riskLevel: 'low',
      confidence: 0.91,
      recommendedAction: 'approve',
      summary: 'No obvious violation.',
      violations: [],
      createdAt: new Date('2026-03-13T00:00:00.000Z'),
    });

    const service = new ListingModerationWorkflowService(
      prisma as never,
      notificationsService as NotificationsService,
      aiModerationService as AiModerationService,
      moderationAuditService as ModerationAuditService,
    );

    const result = await service.runForListing('listing-1');

    expect(result.appliedAction).toBe('approved');
    expect(result.status).toBe('success');
    expect(prisma.listing.update).toHaveBeenCalledWith({
      where: { id: 'listing-1' },
      data: { approvalStatus: 'APPROVED' },
    });
    expect(moderationAuditService.createSuccess).toHaveBeenCalledWith({
      listingId: 'listing-1',
      model: 'openrouter/test-model',
      inputHash: 'hash-1',
      riskLevel: 'LOW',
      confidence: 0.91,
      violations: [],
      summary: 'No obvious violation.',
      recommendedAction: 'APPROVE',
      appliedAction: 'APPROVED',
      processingMs: 1200,
    });
    expect(notificationsService.create).toHaveBeenCalled();
  });

  it('keeps listing pending when provider fails', async () => {
    prisma.listing.findUnique.mockResolvedValue(listingSnapshot);
    (aiModerationService.evaluateListing as jest.Mock).mockRejectedValue(
      new Error('provider down'),
    );
    (moderationAuditService.createError as jest.Mock).mockResolvedValue({
      riskLevel: 'ERROR',
      confidence: null,
      recommendedAction: null,
      summary: null,
      violationsJson: [],
      createdAt: new Date('2026-03-13T00:00:00.000Z'),
    });
    (moderationAuditService.mapRunToView as jest.Mock).mockReturnValue({
      riskLevel: 'error',
      confidence: null,
      recommendedAction: null,
      summary: null,
      violations: [],
      createdAt: new Date('2026-03-13T00:00:00.000Z'),
    });

    const service = new ListingModerationWorkflowService(
      prisma as never,
      notificationsService as NotificationsService,
      aiModerationService as AiModerationService,
      moderationAuditService as ModerationAuditService,
    );

    const result = await service.runForListing('listing-1');

    expect(result.appliedAction).toBe('pending');
    expect(result.status).toBe('error');
    expect(result.failureType).toBe('UNKNOWN');
    expect(moderationAuditService.createError).toHaveBeenCalledWith({
      listingId: 'listing-1',
      model: 'openrouter/test-model',
      inputHash: 'hash-1',
      processingMs: 0,
      failureType: 'UNKNOWN',
      errorMessage: 'provider down',
    });
    expect(prisma.listing.update).not.toHaveBeenCalled();
    expect(notificationsService.create).not.toHaveBeenCalled();
  });
});
