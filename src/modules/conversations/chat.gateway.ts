import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AUTH_COOKIE_NAME } from '../../common/constants/auth.constants';
import { extractCookieValue } from '../../common/utils/cookies';
import { SendMessageDto } from './dto/send-message.dto';
import { AuthUser, ConversationsService } from './conversations.service';

type JwtPayload = {
  sub: string;
  role: string;
};

type ChatSendPayload = {
  conversationId?: string;
  content?: string;
  imageUrl?: string;
  type?: string;
  clientTempId?: string;
};

type ChatErrorPayload = {
  code: string;
  message: string;
  conversationId?: string;
  clientTempId?: string;
};

type SocketWithAuth = Socket & {
  data: {
    authUser?: AuthUser;
  };
  handshake: Socket['handshake'] & {
    headers?: {
      cookie?: string;
    };
  };
};

@Injectable()
@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly conversationsService: ConversationsService,
  ) {}

  afterInit(server: Server) {
    server.use((socket, next) => {
      try {
        const authUser = this.extractAuthUser(socket);
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
  }

  @SubscribeMessage('chat:send')
  async handleChatSend(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: ChatSendPayload,
  ) {
    const authUser = (socket as SocketWithAuth).data.authUser;
    if (!authUser) {
      this.emitError(socket, {
        code: 'UNAUTHORIZED',
        message: 'Unauthorized',
      });
      return;
    }

    const conversationId = payload.conversationId?.trim();
    if (!conversationId) {
      this.emitError(socket, {
        code: 'VALIDATION_ERROR',
        message: 'conversationId is required',
        clientTempId: payload.clientTempId,
      });
      return;
    }

    const clientTempId = payload.clientTempId?.trim();
    if (!clientTempId) {
      this.emitError(socket, {
        code: 'VALIDATION_ERROR',
        message: 'clientTempId is required',
        conversationId,
      });
      return;
    }

    const sendPayload: SendMessageDto = {
      content: payload.content,
      imageUrl: payload.imageUrl,
      type: payload.type,
    };

    try {
      const result = await this.conversationsService.sendMessageRealtime(
        conversationId,
        authUser,
        sendPayload,
      );
      const envelope = {
        conversationId,
        message: result.message,
        clientTempId,
      };

      for (const participantId of new Set(result.participantIds)) {
        this.server
          .to(this.userRoom(participantId))
          .emit('chat:message', envelope);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to send message';
      this.logger.warn(
        `chat:send failed conversation=${conversationId} user=${authUser.userId}`,
      );
      this.emitError(socket, {
        code: this.errorCode(error),
        message,
        conversationId,
        clientTempId,
      });
    }
  }

  private emitError(socket: Socket, payload: ChatErrorPayload) {
    socket.emit('chat:error', payload);
  }

  private extractAuthUser(socket: Socket): AuthUser {
    const typedSocket = socket as SocketWithAuth;
    const cookieToken = extractCookieValue(
      typedSocket.handshake.headers?.cookie,
      AUTH_COOKIE_NAME,
    );
    const token =
      cookieToken ??
      (typeof socket.handshake.auth?.token === 'string'
        ? socket.handshake.auth.token
        : undefined);

    if (typeof token !== 'string' || !token.trim()) {
      throw new UnauthorizedException('Missing access token');
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      if (!payload.sub) {
        throw new UnauthorizedException('Invalid token payload');
      }
      return { userId: payload.sub };
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private userRoom(userId: string) {
    return `user:${userId}`;
  }

  private errorCode(error: unknown): string {
    if (error instanceof UnauthorizedException) {
      return 'UNAUTHORIZED';
    }
    if (error instanceof NotFoundException) {
      return 'NOT_FOUND';
    }
    if (error instanceof BadRequestException) {
      return 'BAD_REQUEST';
    }
    if (error instanceof ForbiddenException) {
      return 'FORBIDDEN';
    }
    return 'SEND_FAILED';
  }
}
