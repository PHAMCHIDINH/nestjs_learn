import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateReportDto } from './dto/create-report.dto';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, payload: CreateReportDto) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: payload.listingId },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.sellerId === userId) {
      throw new BadRequestException('Cannot report your own listing');
    }

    const report = await this.prisma.report.create({
      data: {
        listingId: payload.listingId,
        reportedById: userId,
        reason: payload.reason.trim(),
      },
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
    });

    return {
      id: report.id,
      status: report.status.toLowerCase(),
      reason: report.reason,
      createdAt: report.createdAt,
      listingId: report.listingId,
      reportedById: report.reportedById,
    };
  }
}
