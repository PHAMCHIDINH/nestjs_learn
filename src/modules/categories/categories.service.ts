import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const categories = await this.prisma.category.findMany({
      orderBy: { slug: 'asc' },
      include: {
        _count: {
          select: {
            listings: true,
          },
        },
      },
    });

    return categories.map((category) => ({
      id: category.id,
      key: category.slug,
      name: category.name,
      icon: category.icon,
      count: category._count.listings,
    }));
  }
}
