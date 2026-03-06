import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AUTH_COOKIE_NAME } from '../constants/auth.constants';

type JwtPayload = {
  sub: string;
  role: string;
};

type RequestWithAuth = {
  headers: {
    authorization?: string;
    cookie?: string;
  };
  user?: {
    userId: string;
    role: string;
  };
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const token = this.extractTokenFromRequest(request);

    if (!token) {
      throw new UnauthorizedException('Missing access token');
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      request.user = {
        userId: payload.sub,
        role: payload.role,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private extractTokenFromRequest(request: RequestWithAuth): string | null {
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    const cookieHeader = request.headers.cookie;
    if (!cookieHeader) {
      return null;
    }

    const cookies = cookieHeader.split(';').map((part) => part.trim());
    const tokenCookie = cookies.find((part) =>
      part.startsWith(`${AUTH_COOKIE_NAME}=`),
    );

    if (!tokenCookie) {
      return null;
    }

    return decodeURIComponent(tokenCookie.split('=').slice(1).join('='));
  }
}
