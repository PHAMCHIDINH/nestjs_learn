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
import { CloudinaryService } from '../../core/media/cloudinary.service';
import {
  CreateListingDto,
  ListingImageInputDto,
} from './dto/create-listing.dto';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async create(payload: CreateListingDto, authUser: AuthUser) {
    const category = await this.prisma.category.findUnique({
      where: { slug: payload.category.trim().toLowerCase() },
    });

    if (!category) {
      throw new BadRequestException('Invalid category');
    }

    const slug = await this.generateSlug(payload.title);
    const images = this.normalizeImageInputs(payload.images);

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
        images: images.length
          ? {
              create: images.map((image, index) => ({
                url: image.url,
                publicId: image.publicId,
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
    const where = await this.buildListWhere(query, authUser);

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
    const where = await this.buildListWhere(query, authUser);
    where.sellerId = sellerId;
    if (!query.approvalStatus && authUser?.userId === sellerId) {
      delete where.approvalStatus;
    }

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

    const normalizedImages =
      payload.images !== undefined
        ? this.normalizeImageInputs(payload.images)
        : undefined;

    const listing =
      normalizedImages !== undefined
        ? await this.prisma.$transaction(async (tx) => {
            await tx.listing.update({
              where: { id },
              data,
            });

            await tx.listingImage.deleteMany({
              where: { listingId: id },
            });

            if (normalizedImages.length > 0) {
              await tx.listingImage.createMany({
                data: normalizedImages.map((image, index) => ({
                  listingId: id,
                  url: image.url,
                  publicId: image.publicId ?? null,
                  order: index,
                })),
              });
            }

            return tx.listing.findUniqueOrThrow({
              where: { id },
              include: this.listingInclude,
            });
          })
        : await this.prisma.listing.update({
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
    const existing = await this.prisma.listing.findUnique({
      where: { id },
      include: {
        images: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Listing not found');
    }

    this.assertCanMutate(existing.sellerId, authUser);

    const imagesWithPublicId = existing.images
      .map((image) => image.publicId)
      .filter((publicId): publicId is string => Boolean(publicId));

    await Promise.all(
      imagesWithPublicId.map((publicId) =>
        this.cloudinaryService.destroyImage(publicId),
      ),
    );

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
    authUser?: AuthUser,
  ): Promise<Prisma.ListingWhereInput> {
    if (query.approvalStatus && authUser?.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'approvalStatus filter is only available for admin',
      );
    }

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

    const categorySlugs = Array.from(
      new Set(
        [
          ...(query.category?.trim() ? [query.category.trim()] : []),
          ...(query.categories ?? []),
        ]
          .map((slug) => slug.trim().toLowerCase())
          .filter(Boolean),
      ),
    );

    if (categorySlugs.length > 0) {
      const categories = await this.prisma.category.findMany({
        where: {
          slug: {
            in: categorySlugs,
          },
        },
        select: { id: true, slug: true },
      });

      if (categories.length !== categorySlugs.length) {
        throw new BadRequestException('Invalid category filter');
      }

      where.categoryId =
        categories.length === 1
          ? categories[0].id
          : {
              in: categories.map((category) => category.id),
            };
    }

    const conditions = Array.from(
      new Set([
        ...(query.condition?.trim() ? [query.condition.trim()] : []),
        ...(query.conditions ?? []),
      ]),
    )
      .filter(Boolean)
      .map((value) => this.parseCondition(value));

    if (conditions.length > 0) {
      where.condition =
        conditions.length === 1 ? conditions[0] : { in: conditions };
    }

    if (query.status?.trim()) {
      where.status = this.parseStatus(query.status);
    }

    const departments = Array.from(
      new Set([
        ...(query.department?.trim() ? [query.department.trim()] : []),
        ...(query.departments ?? []),
      ]),
    )
      .filter(Boolean)
      .map((value) => this.parseDepartment(value));

    if (departments.length > 0) {
      where.department =
        departments.length === 1 ? departments[0] : { in: departments };
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

  private normalizeImageInputs(inputs?: ListingImageInputDto[]) {
    if (!inputs || inputs.length === 0) {
      return [];
    }

    if (inputs.length > 5) {
      throw new BadRequestException('images must contain at most 5 items');
    }

    return inputs.map((input) => {
      if (typeof input === 'string') {
        return {
          url: this.ensureValidUrl(input, 'images'),
          publicId: undefined,
        };
      }

      if (
        !input ||
        typeof input !== 'object' ||
        typeof input.url !== 'string'
      ) {
        throw new BadRequestException('Invalid images payload');
      }

      return {
        url: this.ensureValidUrl(input.url, 'images'),
        publicId:
          typeof input.publicId === 'string' && input.publicId.trim()
            ? input.publicId.trim()
            : undefined,
      };
    });
  }

  private ensureValidUrl(value: string, field: string) {
    const trimmed = value.trim();
    try {
      const parsedUrl = new URL(trimmed);
      if (!parsedUrl.protocol.startsWith('http')) {
        throw new Error('Unsupported URL protocol');
      }
      return trimmed;
    } catch {
      throw new BadRequestException(`Invalid URL in ${field}`);
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
