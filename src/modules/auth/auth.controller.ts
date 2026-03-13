import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

type AuthUser = {
  userId: string;
  role: string;
};

type RequestWithId = Request & {
  requestId?: string;
};

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register account and send OTP' })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  register(@Body() payload: RegisterDto, @Req() request: RequestWithId) {
    return this.authService.register(payload, request.requestId);
  }

  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend OTP to unverified account' })
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  resendOtp(@Body() payload: ResendOtpDto, @Req() request: RequestWithId) {
    return this.authService.resendOtp(payload, request.requestId);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify registration OTP and issue auth token' })
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  verifyOtp(
    @Body() payload: VerifyOtpDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.verifyOtp(payload, response);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  login(
    @Body() payload: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.login(payload, response);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('bearer')
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiOperation({ summary: 'Get authenticated user profile' })
  me(@CurrentUser() authUser: AuthUser) {
    return this.authService.me(authUser);
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('bearer')
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiOperation({ summary: 'Logout current user and clear auth cookie' })
  logout(
    @CurrentUser() authUser: AuthUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.logout(authUser, response);
  }

  @Post('socket-token')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('bearer')
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiOperation({
    summary: 'Issue a short-lived websocket token for realtime chat',
  })
  socketToken(@CurrentUser() authUser: AuthUser) {
    return this.authService.createSocketToken(authUser);
  }
}
