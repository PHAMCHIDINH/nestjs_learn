import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Department, OtpType, Prisma } from '@prisma/client';
import type { Response } from 'express';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../../core/database/prisma.service';
import { MailService } from '../../core/mail/mail.service';
import {
  AUTH_COOKIE_NAME,
  JWT_EXPIRES_IN,
} from '../../common/constants/auth.constants';
import {
  mapDepartmentFromFrontend,
  mapUserToFrontend,
} from '../users/user.mapper';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

type AuthUser = {
  userId: string;
  role: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  async register(payload: RegisterDto, requestId?: string) {
    const email = payload.email.trim().toLowerCase();
    const studentId = payload.studentId.trim();
    let department: Department;
    try {
      department = mapDepartmentFromFrontend(payload.department);
    } catch {
      throw new BadRequestException('Invalid department value');
    }

    const passwordHash = await bcrypt.hash(payload.password, 10);
    const { user, otpCode } = await this.prisma.$transaction(
      async (tx) => {
        const existingByEmail = await tx.user.findUnique({
          where: { email },
        });
        const existingByStudentId = await tx.user.findUnique({
          where: { studentId },
        });

        if (existingByStudentId && existingByStudentId.email !== email) {
          throw new ConflictException('studentId already exists');
        }

        if (existingByEmail?.isVerified) {
          throw new ConflictException('email already exists');
        }

        const user = existingByEmail
          ? await tx.user.update({
              where: { id: existingByEmail.id },
              data: {
                name: payload.name.trim(),
                studentId,
                department,
                passwordHash,
                isVerified: false,
              },
            })
          : await tx.user.create({
              data: {
                email,
                studentId,
                name: payload.name.trim(),
                department,
                passwordHash,
              },
            });

        const otpCode = await this.createOtp(tx, email, OtpType.REGISTER);

        return { user, otpCode };
      },
      { timeout: 20_000 },
    );

    if (!this.mailService.isManualOtpDelivery()) {
      await this.mailService.sendOtpEmail(email, otpCode, {
        requestId,
      });
    }

    return {
      message: 'OTP sent successfully',
      email,
      debugOtp: this.shouldExposeDebugOtp() ? otpCode : undefined,
      user: mapUserToFrontend(user),
    };
  }

  async resendOtp(payload: ResendOtpDto, requestId?: string) {
    const email = payload.email.trim().toLowerCase();

    const otpCode = await this.prisma.$transaction(
      async (tx) => {
        const user = await tx.user.findUnique({
          where: { email },
        });

        if (!user) {
          throw new NotFoundException('User not found');
        }

        if (user.isVerified) {
          throw new BadRequestException('User is already verified');
        }

        const otpCode = await this.createOtp(tx, email, OtpType.REGISTER);
        return otpCode;
      },
      { timeout: 20_000 },
    );

    if (!this.mailService.isManualOtpDelivery()) {
      await this.mailService.sendOtpEmail(email, otpCode, {
        requestId,
      });
    }

    return {
      message: 'OTP resent successfully',
      email,
      debugOtp: this.shouldExposeDebugOtp() ? otpCode : undefined,
    };
  }

  async verifyOtp(payload: VerifyOtpDto, response: Response) {
    const email = payload.email.trim().toLowerCase();
    const code = payload.code.trim();

    const otp = await this.prisma.otpVerification.findFirst({
      where: {
        email,
        code,
        type: OtpType.REGISTER,
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      throw new UnauthorizedException('Invalid OTP code');
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.$transaction([
      this.prisma.otpVerification.update({
        where: { id: otp.id },
        data: { used: true },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          isVerified: true,
          isOnline: true,
          lastSeen: new Date(),
        },
      }),
    ]);

    const token = this.signToken(user.id, user.role);
    this.setAuthCookie(response, token);

    const refreshedUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });

    return {
      accessToken: token,
      user: mapUserToFrontend(refreshedUser),
    };
  }

  async login(payload: LoginDto, response: Response) {
    const email = payload.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User is disabled');
    }

    const passwordMatches = await bcrypt.compare(
      payload.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isVerified) {
      throw new UnauthorizedException('Account is not verified');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isOnline: true,
        lastSeen: new Date(),
      },
    });

    const token = this.signToken(user.id, user.role);
    this.setAuthCookie(response, token);

    const refreshedUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });

    return {
      accessToken: token,
      user: mapUserToFrontend(refreshedUser),
    };
  }

  async me(authUser: AuthUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: authUser.userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return mapUserToFrontend(user);
  }

  async logout(authUser: AuthUser, response: Response) {
    await this.prisma.user.update({
      where: { id: authUser.userId },
      data: {
        isOnline: false,
        lastSeen: new Date(),
      },
    });

    response.clearCookie(AUTH_COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });

    return { message: 'Logged out successfully' };
  }

  private async createOtp(
    tx: Prisma.TransactionClient,
    email: string,
    type: OtpType,
  ): Promise<string> {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await tx.otpVerification.create({
      data: {
        email,
        code,
        type,
        expiresAt,
      },
    });

    return code;
  }

  private signToken(userId: string, role: string): string {
    return this.jwtService.sign(
      { sub: userId, role },
      {
        expiresIn: JWT_EXPIRES_IN,
      },
    );
  }

  private shouldExposeDebugOtp(): boolean {
    return (
      this.mailService.isManualOtpDelivery() ||
      process.env.NODE_ENV !== 'production'
    );
  }

  private setAuthCookie(response: Response, token: string) {
    response.cookie(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });
  }
}
