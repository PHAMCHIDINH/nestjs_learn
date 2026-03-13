import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalStatus, ReportStatus } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { ListingModerationJobService } from '../ai/listing-moderation-job.service';
import { ListingModerationWorkflowService } from '../ai/listing-moderation-workflow.service';
import { ListingQueryDto } from '../listings/dto/listing-query.dto';
import { mapListingToFrontend } from '../listings/listing.mapper';
import { mapUserToFrontend } from '../users/user.mapper';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly listingModerationJobService: ListingModerationJobService,
    private readonly listingModerationWorkflowService: ListingModerationWorkflowService,
  ) {}

  async pendingListings(query: ListingQueryDto) {
    const [total, listings] = await this.prisma.$transaction([
      this.prisma.listing.count({
        where: { approvalStatus: ApprovalStatus.PENDING },
      }),
      this.prisma.listing.findMany({
        where: { approvalStatus: ApprovalStatus.PENDING },
        include: {
          seller: true,
          category: true,
          images: { orderBy: { order: 'asc' } },
          favorites: true,
          moderationRuns: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          moderationJob: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    return {
      data: listings.map((listing) => mapListingToFrontend(listing)),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async approveListing(id: string) {
    await this.listingModerationWorkflowService.approveListing(id);

    return { message: 'Listing approved' };
  }

  async rejectListing(id: string) {
    await this.listingModerationWorkflowService.rejectListing(id);

    return { message: 'Listing rejected' };
  }

  async rerunModeration(id: string) {
    if (!this.listingModerationJobService.isEnabled()) {
      throw new BadRequestException('AI moderation is disabled');
    }

    const listing = await this.prisma.listing.findUnique({ where: { id } });
    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    const jobStatus = await this.listingModerationJobService.enqueue(id, {
      preserveRunning: true,
    });

    return {
      message: 'Listing moderation rerun queued',
      listingId: id,
      jobStatus,
    };
  }

  async reports(query: ListingQueryDto) {
    const where = query.status
      ? {
          status: this.parseReportStatus(query.status),
        }
      : undefined;

    const [total, reports] = await this.prisma.$transaction([
      this.prisma.report.count({ where }),
      this.prisma.report.findMany({
        where,
        include: {
          listing: {
            include: {
              seller: true,
              category: true,
              images: { orderBy: { order: 'asc' } },
              favorites: true,
            },
          },
          reportedBy: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    return {
      data: reports.map((report) => ({
        id: report.id,
        reason: report.reason,
        status: report.status.toLowerCase(),
        createdAt: report.createdAt,
        productId: report.listingId,
        product: mapListingToFrontend(report.listing),
        reportedBy: mapUserToFrontend(report.reportedBy),
      })),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async resolveReport(id: string) {
    const report = await this.prisma.report.findUnique({
      where: { id },
      include: { listing: true },
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    await this.prisma.$transaction([
      this.prisma.report.update({
        where: { id },
        data: { status: ReportStatus.RESOLVED },
      }),
      this.prisma.listing.update({
        where: { id: report.listingId },
        data: { approvalStatus: ApprovalStatus.REJECTED },
      }),
    ]);

    return { message: 'Report resolved' };
  }

  async dismissReport(id: string) {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) {
      throw new NotFoundException('Report not found');
    }

    await this.prisma.report.update({
      where: { id },
      data: { status: ReportStatus.REVIEWED },
    });

    return { message: 'Report reviewed' };
  }

  private parseReportStatus(value: string): ReportStatus {
    const normalized = value.trim().toLowerCase();
    switch (normalized) {
      case 'pending':
        return ReportStatus.PENDING;
      case 'reviewed':
        return ReportStatus.REVIEWED;
      case 'resolved':
        return ReportStatus.RESOLVED;
      default:
        throw new BadRequestException('Invalid report status');
    }
  }
}
