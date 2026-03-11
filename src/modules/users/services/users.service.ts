import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalStatus, Department, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../../../core/database/prisma.service';
import { CloudinaryService } from '../../../core/media/cloudinary.service';
import { ListingQueryDto } from '../../listings/dto/listing-query.dto';
import {
  mapConditionFromFrontend,
  mapDepartmentFromFrontendValue,
  mapListingToFrontend,
  mapStatusFromFrontend,
} from '../../listings/listing.mapper';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateMeDto } from '../dto/update-me.dto';
import { mapDepartmentToFrontend, mapUserToFrontend } from '../user.mapper';

type AuthUser = {
  userId: string;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async findAll() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return users.map(mapUserToFrontend);
  }

  async create(payload: CreateUserDto) {
    const email = payload.email.trim().toLowerCase();
    const studentId = payload.studentId.trim();

    const existingByEmail = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingByEmail) {
      throw new ConflictException('email already exists');
    }

    const existingByStudentId = await this.prisma.user.findUnique({
      where: { studentId },
    });
    if (existingByStudentId) {
      throw new ConflictException('studentId already exists');
    }

    const passwordHash = await bcrypt.hash(payload.password, 10);
    let department: Department | undefined;
    try {
      department = payload.department
        ? mapDepartmentFromFrontendValue(payload.department)
        : undefined;
    } catch {
      throw new BadRequestException('Invalid department');
    }

    const user = await this.prisma.user.create({
      data: {
        email,
        studentId,
        passwordHash,
        name: payload.name.trim(),
        department,
        isVerified: true,
      },
    });

    return mapUserToFrontend(user);
  }

  async me(authUser: AuthUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: authUser.userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return mapUserToFrontend(user);
  }

  async findPublicProfile(id: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        department: true,
        studentId: true,
        isVerified: true,
        sellerRating: true,
        totalReviews: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      name: user.name,
      avatar: user.avatarUrl ?? undefined,
      department: mapDepartmentToFrontend(user.department),
      studentId: user.studentId,
      isVerified: user.isVerified,
      sellerRating: user.sellerRating,
      totalReviews: user.totalReviews,
      createdAt: user.createdAt,
    };
  }

  async updateMe(authUser: AuthUser, payload: UpdateMeDto) {
    const existing = await this.prisma.user.findUnique({
      where: { id: authUser.userId },
    });

    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const data: Prisma.UserUpdateInput = {};

    if (payload.name !== undefined) {
      const trimmedName = payload.name.trim();
      if (!trimmedName) {
        throw new BadRequestException('Invalid name');
      }
      data.name = trimmedName;
    }

    if (payload.department !== undefined) {
      try {
        data.department = payload.department
          ? mapDepartmentFromFrontendValue(payload.department)
          : undefined;
      } catch {
        throw new BadRequestException('Invalid department');
      }
    }

    if (payload.avatar !== undefined) {
      if (payload.avatar === null) {
        if (existing.avatarPublicId) {
          await this.cloudinaryService.destroyImage(existing.avatarPublicId);
        }
        data.avatarUrl = null;
        data.avatarPublicId = null;
      } else {
        const avatarUrl = this.ensureValidHttpUrl(payload.avatar.url, 'avatar');
        const avatarPublicId = payload.avatar.publicId?.trim() || null;

        if (
          existing.avatarPublicId &&
          existing.avatarPublicId !== avatarPublicId
        ) {
          await this.cloudinaryService.destroyImage(existing.avatarPublicId);
        }

        data.avatarUrl = avatarUrl;
        data.avatarPublicId = avatarPublicId;
      }
    }

    if (Object.keys(data).length === 0) {
      return mapUserToFrontend(existing);
    }

    const user = await this.prisma.user.update({
      where: { id: authUser.userId },
      data,
    });

    return mapUserToFrontend(user);
  }

  async myListings(authUser: AuthUser, query: ListingQueryDto) {
    const where: Prisma.ListingWhereInput = {
      sellerId: authUser.userId,
    };

    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (query.status) {
      try {
        where.status = mapStatusFromFrontend(query.status);
      } catch {
        throw new BadRequestException('Invalid status');
      }
    }

    if (query.condition) {
      try {
        where.condition = mapConditionFromFrontend(query.condition);
      } catch {
        throw new BadRequestException('Invalid condition');
      }
    }

    if (query.category?.trim()) {
      const category = await this.prisma.category.findUnique({
        where: { slug: query.category.trim().toLowerCase() },
      });
      if (!category) {
        throw new BadRequestException('Invalid category');
      }
      where.categoryId = category.id;
    }

    const [total, listings] = await this.prisma.$transaction([
      this.prisma.listing.count({ where }),
      this.prisma.listing.findMany({
        where,
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
      data: listings.map((listing) =>
        mapListingToFrontend(listing, authUser.userId),
      ),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async mySavedListings(authUser: AuthUser, query: ListingQueryDto) {
    const where: Prisma.ListingWhereInput = {
      approvalStatus: ApprovalStatus.APPROVED,
      favorites: {
        some: {
          userId: authUser.userId,
        },
      },
    };

    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, listings] = await this.prisma.$transaction([
      this.prisma.listing.count({ where }),
      this.prisma.listing.findMany({
        where,
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
      data: listings.map((listing) =>
        mapListingToFrontend(listing, authUser.userId),
      ),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async blockUser(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) {
      throw new BadRequestException('Cannot block yourself');
    }

    const blocked = await this.prisma.user.findFirst({
      where: {
        id: blockedId,
        isActive: true,
      },
      select: { id: true },
    });

    if (!blocked) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.userBlock.upsert({
      where: {
        blockerId_blockedId: {
          blockerId,
          blockedId,
        },
      },
      update: {},
      create: {
        blockerId,
        blockedId,
      },
    });

    return { blocked: true };
  }

  async unblockUser(blockerId: string, blockedId: string) {
    await this.prisma.userBlock.deleteMany({
      where: {
        blockerId,
        blockedId,
      },
    });

    return { blocked: false };
  }

  private ensureValidHttpUrl(value: string, field: string): string {
    const trimmed = value.trim();

    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Invalid protocol');
      }
      return trimmed;
    } catch {
      throw new BadRequestException(`Invalid ${field} URL`);
    }
  }
}
