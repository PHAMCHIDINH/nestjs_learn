import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalStatus, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../../../core/database/prisma.service';
import { ListingQueryDto } from '../../listings/dto/listing-query.dto';
import {
  mapConditionFromFrontend,
  mapDepartmentFromFrontendValue,
  mapListingToFrontend,
  mapStatusFromFrontend,
} from '../../listings/listing.mapper';
import { CreateUserDto } from '../dto/create-user.dto';
import { mapUserToFrontend } from '../user.mapper';

type AuthUser = {
  userId: string;
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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
    let department;
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
}
