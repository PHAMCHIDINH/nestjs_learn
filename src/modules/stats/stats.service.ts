import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicStats() {
    const [totalUsers, totalListings, totalConversations] =
      await this.prisma.$transaction([
        this.prisma.user.count(),
        this.prisma.listing.count(),
        this.prisma.conversation.count(),
      ]);

    return {
      totalUsers,
      totalListings,
      totalConversations,
    };
  }
}
