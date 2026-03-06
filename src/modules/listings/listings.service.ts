import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApprovalStatus,
  Condition,
  Department,
  ListingStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { ListingQueryDto } from './dto/listing-query.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import {
  mapConditionFromFrontend,
  mapDepartmentFromFrontendValue,
  mapListingToFrontend,
  mapStatusFromFrontend,
} from './listing.mapper';

type AuthUser = {
  userId: string;
  role: string;
};

@Injectable()
export class ListingsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(payload: CreateListingDto, authUser: AuthUser) {
    const category = await this.prisma.category.findUnique({
      where: { slug: payload.category.trim().toLowerCase() },
    });

    if (!category) {
      throw new BadRequestException('Invalid category');
    }

    const slug = await this.generateSlug(payload.title);

    const listing = await this.prisma.listing.create({
      data: {
        title: payload.title.trim(),
        description: payload.description.trim(),
        price: payload.price,
        originalPrice: payload.originalPrice,
        condition: this.parseCondition(payload.condition),
        department: payload.department
          ? this.parseDepartment(payload.department)
          : undefined,
        status: ListingStatus.SELLING,
        approvalStatus: ApprovalStatus.PENDING,
        slug,
        sellerId: authUser.userId,
        categoryId: category.id,
        images: payload.images?.length
          ? {
              create: payload.images.map((url, index) => ({
                url,
                order: index,
              })),
            }
          : undefined,
      },
      include: this.listingInclude,
    });

    return mapListingToFrontend(listing, authUser.userId);
  }

  async findAll(query: ListingQueryDto, authUser?: AuthUser) {
    const where = await this.buildListWhere(query);

    const [total, listings] = await this.prisma.$transaction([
      this.prisma.listing.count({ where }),
      this.prisma.listing.findMany({
        where,
        include: this.listingInclude,
        orderBy: this.buildSort(query.sortBy),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    return {
      data: listings.map((listing) =>
        mapListingToFrontend(listing, authUser?.userId),
      ),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string, authUser?: AuthUser) {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      include: this.listingInclude,
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (
      listing.approvalStatus !== ApprovalStatus.APPROVED &&
      authUser?.userId !== listing.sellerId &&
      authUser?.role !== UserRole.ADMIN
    ) {
      throw new NotFoundException('Listing not found');
    }

    await this.prisma.listing.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });

    return mapListingToFrontend(
      {
        ...listing,
        viewCount: listing.viewCount + 1,
      },
      authUser?.userId,
    );
  }

  async findBySeller(
    sellerId: string,
    query: ListingQueryDto,
    authUser?: AuthUser,
  ) {
    const where = await this.buildListWhere(query);
    where.sellerId = sellerId;

    const [total, listings] = await this.prisma.$transaction([
      this.prisma.listing.count({ where }),
      this.prisma.listing.findMany({
        where,
        include: this.listingInclude,
        orderBy: this.buildSort(query.sortBy),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    return {
      data: listings.map((listing) =>
        mapListingToFrontend(listing, authUser?.userId),
      ),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async update(id: string, payload: UpdateListingDto, authUser: AuthUser) {
    const existing = await this.prisma.listing.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Listing not found');
    }

    this.assertCanMutate(existing.sellerId, authUser);

    const categorySlug = payload.category?.trim().toLowerCase();
    const category = categorySlug
      ? await this.prisma.category.findUnique({ where: { slug: categorySlug } })
      : null;

    if (categorySlug && !category) {
      throw new BadRequestException('Invalid category');
    }

    const data: Prisma.ListingUpdateInput = {
      title: payload.title?.trim(),
      description: payload.description?.trim(),
      price: payload.price,
      originalPrice: payload.originalPrice,
      condition: payload.condition
        ? this.parseCondition(payload.condition)
        : undefined,
      status: payload.status ? this.parseStatus(payload.status) : undefined,
      department: payload.department
        ? this.parseDepartment(payload.department)
        : undefined,
      category: category
        ? {
            connect: { id: category.id },
          }
        : undefined,
    };

    if (payload.title?.trim()) {
      data.slug = await this.generateSlug(payload.title, existing.id);
    }

    const listing = await this.prisma.listing.update({
      where: { id },
      data,
      include: this.listingInclude,
    });

    return mapListingToFrontend(listing, authUser.userId);
  }

  async updateStatus(id: string, status: string, authUser: AuthUser) {
    const existing = await this.prisma.listing.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('Listing not found');
    }

    this.assertCanMutate(existing.sellerId, authUser);

    const listing = await this.prisma.listing.update({
      where: { id },
      data: {
        status: this.parseStatus(status),
      },
      include: this.listingInclude,
    });

    return mapListingToFrontend(listing, authUser.userId);
  }

  async remove(id: string, authUser: AuthUser) {
    const existing = await this.prisma.listing.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('Listing not found');
    }

    this.assertCanMutate(existing.sellerId, authUser);

    await this.prisma.listing.delete({ where: { id } });

    return { message: 'Listing deleted successfully' };
  }

  async saveListing(id: string, authUser: AuthUser) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    await this.prisma.favorite.upsert({
      where: {
        userId_listingId: {
          userId: authUser.userId,
          listingId: id,
        },
      },
      update: {},
      create: {
        userId: authUser.userId,
        listingId: id,
      },
    });

    return { saved: true };
  }

  async unsaveListing(id: string, authUser: AuthUser) {
    await this.prisma.favorite.deleteMany({
      where: {
        userId: authUser.userId,
        listingId: id,
      },
    });

    return { saved: false };
  }

  private get listingInclude() {
    return {
      seller: true,
      category: true,
      images: {
        orderBy: { order: 'asc' as const },
      },
      favorites: true,
    };
  }

  private async buildListWhere(
    query: ListingQueryDto,
  ): Promise<Prisma.ListingWhereInput> {
    const where: Prisma.ListingWhereInput = {
      approvalStatus: query.approvalStatus
        ? this.parseApprovalStatus(query.approvalStatus)
        : ApprovalStatus.APPROVED,
    };

    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (query.category?.trim()) {
      const category = await this.prisma.category.findUnique({
        where: { slug: query.category.trim().toLowerCase() },
      });
      if (!category) {
        throw new BadRequestException('Invalid category filter');
      }
      where.categoryId = category.id;
    }

    if (query.condition?.trim()) {
      where.condition = this.parseCondition(query.condition);
    }

    if (query.status?.trim()) {
      where.status = this.parseStatus(query.status);
    }

    if (query.department?.trim()) {
      where.department = this.parseDepartment(query.department);
    }

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      where.price = {
        gte: query.minPrice,
        lte: query.maxPrice,
      };
    }

    return where;
  }

  private buildSort(
    sortBy: ListingQueryDto['sortBy'],
  ): Prisma.ListingOrderByWithRelationInput {
    switch (sortBy) {
      case 'oldest':
        return { createdAt: 'asc' };
      case 'price-asc':
        return { price: 'asc' };
      case 'price-desc':
        return { price: 'desc' };
      case 'popular':
        return { viewCount: 'desc' };
      case 'newest':
      default:
        return { createdAt: 'desc' };
    }
  }

  private parseCondition(value: string): Condition {
    try {
      return mapConditionFromFrontend(value);
    } catch {
      throw new BadRequestException('Invalid condition value');
    }
  }

  private parseStatus(value: string): ListingStatus {
    try {
      return mapStatusFromFrontend(value);
    } catch {
      throw new BadRequestException('Invalid status value');
    }
  }

  private parseDepartment(value: string): Department {
    try {
      return mapDepartmentFromFrontendValue(value);
    } catch {
      throw new BadRequestException('Invalid department value');
    }
  }

  private parseApprovalStatus(value: string): ApprovalStatus {
    const normalized = value.trim().toLowerCase();
    switch (normalized) {
      case 'pending':
        return ApprovalStatus.PENDING;
      case 'approved':
        return ApprovalStatus.APPROVED;
      case 'rejected':
        return ApprovalStatus.REJECTED;
      default:
        throw new BadRequestException('Invalid approvalStatus value');
    }
  }

  private assertCanMutate(sellerId: string, authUser: AuthUser) {
    if (authUser.role === UserRole.ADMIN) {
      return;
    }

    if (sellerId !== authUser.userId) {
      throw new ForbiddenException(
        'You do not have permission for this listing',
      );
    }
  }

  private async generateSlug(title: string, excludeId?: string) {
    const base = title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 80);

    let candidate = base || 'listing';
    let index = 1;

    while (true) {
      const existing = await this.prisma.listing.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });

      if (!existing || existing.id === excludeId) {
        return candidate;
      }

      candidate = `${base}-${index}`;
      index += 1;
    }
  }
}
