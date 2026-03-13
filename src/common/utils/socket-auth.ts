import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';

type SocketJwtPayload = {
  sub: string;
  role: string;
  tokenType?: string;
};

export const extractSocketAuthUser = (
  socket: Socket,
  jwtService: JwtService,
): { userId: string } => {
  const token =
    typeof socket.handshake.auth?.token === 'string'
      ? socket.handshake.auth.token
      : undefined;

  if (!token?.trim()) {
    throw new UnauthorizedException('Missing socket token');
  }

  try {
    const payload = jwtService.verify<SocketJwtPayload>(token);
    if (!payload.sub || payload.tokenType !== 'socket') {
      throw new UnauthorizedException('Invalid token payload');
    }

    return { userId: payload.sub };
  } catch {
    throw new UnauthorizedException('Invalid or expired token');
  }
};
