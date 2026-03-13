import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AUTH_COOKIE_NAME } from '../constants/auth.constants';
import { extractCookieValue } from '../utils/cookies';

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
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const token = this.extractTokenFromRequest(request);

    if (!token) {
      return true;
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      request.user = {
        userId: payload.sub,
        role: payload.role,
      };
    } catch {
      // Ignore invalid token for optional auth.
    }

    return true;
  }

  private extractTokenFromRequest(request: RequestWithAuth): string | null {
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    return extractCookieValue(request.headers.cookie, AUTH_COOKIE_NAME);
  }
}
