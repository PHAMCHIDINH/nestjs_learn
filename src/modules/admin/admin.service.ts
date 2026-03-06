import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalStatus, ReportStatus } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { mapListingToFrontend } from '../listings/listing.mapper';
import { mapUserToFrontend } from '../users/user.mapper';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async pendingListings() {
    const listings = await this.prisma.listing.findMany({
      where: { approvalStatus: ApprovalStatus.PENDING },
      include: {
        seller: true,
        category: true,
        images: { orderBy: { order: 'asc' } },
        favorites: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return listings.map((listing) => mapListingToFrontend(listing));
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

    return { message: 'Listing rejected' };
  }

  async reports(status?: string) {
    const where = status
      ? {
          status: this.parseReportStatus(status),
        }
      : undefined;

    const reports = await this.prisma.report.findMany({
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
    });

    return reports.map((report) => ({
      id: report.id,
      reason: report.reason,
      status: report.status.toLowerCase(),
      createdAt: report.createdAt,
      productId: report.listingId,
      product: mapListingToFrontend(report.listing),
      reportedBy: mapUserToFrontend(report.reportedBy),
    }));
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
