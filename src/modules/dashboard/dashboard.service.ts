import { Injectable } from '@nestjs/common';
import { ListingStatus } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(userId: string) {
    const [myPosts, selling, saved, totalViews, messageCount] =
      await this.prisma.$transaction([
        this.prisma.listing.count({ where: { sellerId: userId } }),
        this.prisma.listing.count({
          where: { sellerId: userId, status: ListingStatus.SELLING },
        }),
        this.prisma.favorite.count({ where: { userId } }),
        this.prisma.listing.aggregate({
          where: { sellerId: userId },
          _sum: { viewCount: true },
        }),
        this.prisma.conversationParticipant.count({ where: { userId } }),
      ]);

    return {
      myPosts,
      selling,
      saved,
      conversations: messageCount,
      totalViews: totalViews._sum.viewCount ?? 0,
    };
  }
}
