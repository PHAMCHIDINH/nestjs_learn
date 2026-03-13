import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Notification } from '@prisma/client';
import { Server, Socket } from 'socket.io';
import { extractSocketAuthUser } from '../../common/utils/socket-auth';

type SocketWithAuth = Socket & {
  data: {
    authUser?: {
      userId: string;
    };
  };
};

@Injectable()
@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class NotificationsGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  afterInit(server: Server) {
    server.use((socket, next) => {
      try {
        const authUser = extractSocketAuthUser(socket, this.jwtService);
        (socket as SocketWithAuth).data.authUser = authUser;
        next();
      } catch (error) {
        next(new Error('Unauthorized'));
      }
    });
  }

  handleConnection(@ConnectedSocket() socket: Socket) {
    const authUser = (socket as SocketWithAuth).data.authUser;
    if (!authUser) {
      socket.disconnect(true);
      return;
    }

    socket.join(this.userRoom(authUser.userId));
    this.logger.debug(`Socket connected for user=${authUser.userId}`);
  }

  emitNewNotification(userId: string, payload: Notification) {
    if (!this.server) {
      return;
    }

    this.server.to(this.userRoom(userId)).emit('notification:new', payload);
  }

  private userRoom(userId: string) {
    return `user:${userId}`;
  }
}
