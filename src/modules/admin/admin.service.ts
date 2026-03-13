import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalStatus, NotificationType, ReportStatus } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { ListingQueryDto } from '../listings/dto/listing-query.dto';
import { mapListingToFrontend } from '../listings/listing.mapper';
import { NotificationsService } from '../notifications/notifications.service';
import { mapUserToFrontend } from '../users/user.mapper';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
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
    const listing = await this.prisma.listing.findUnique({ where: { id } });
    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    await this.prisma.listing.update({
      where: { id },
      data: { approvalStatus: ApprovalStatus.APPROVED },
    });

    await this.notificationsService.create(
      listing.sellerId,
      NotificationType.LISTING_APPROVED,
      'Listing approved',
      `Your listing "${listing.title}" has been approved.`,
      {
        listingId: listing.id,
      },
    );

    return { message: 'Listing approved' };
  }

  async rejectListing(id: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });
    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    await this.prisma.listing.update({
      where: { id },
      data: { approvalStatus: ApprovalStatus.REJECTED },
    });

    await this.notificationsService.create(
      listing.sellerId,
      NotificationType.LISTING_REJECTED,
      'Listing rejected',
      `Your listing "${listing.title}" has been rejected.`,
      {
        listingId: listing.id,
      },
    );

    return { message: 'Listing rejected' };
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
