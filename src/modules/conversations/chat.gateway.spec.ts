import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import type { AuthUser } from './conversations.service';

type SocketStub = {
  handshake: {
    auth: {
      token?: string;
    };
  };
  data: {
    authUser?: AuthUser;
  };
  emit: jest.Mock;
  join: jest.Mock;
  disconnect: jest.Mock;
};

const createSocket = (token?: string): SocketStub => ({
  handshake: {
    auth: {
      token,
    },
  },
  data: {},
  emit: jest.fn(),
  join: jest.fn(),
  disconnect: jest.fn(),
});

describe('ChatGateway', () => {
  const verifyMock = jest.fn();
  const sendMessageRealtimeMock = jest.fn();
  const toMock = jest.fn();
  const roomEmitMock = jest.fn();

  let gateway: ChatGateway;
  let middleware:
    | ((socket: unknown, next: (error?: Error) => void) => void)
    | null;

  beforeEach(() => {
    jest.clearAllMocks();
    middleware = null;

    const jwtService = {
      verify: verifyMock,
    };
    const conversationsService = {
      sendMessageRealtime: sendMessageRealtimeMock,
    };

    gateway = new ChatGateway(
      jwtService as never,
      conversationsService as never,
    );

    const server = {
      use: (fn: (socket: unknown, next: (error?: Error) => void) => void) => {
        middleware = fn;
      },
      to: toMock.mockReturnValue({ emit: roomEmitMock }),
    };
    gateway.server = server as never;
    gateway.afterInit(server as never);
  });

  it('rejects socket auth when token is missing', () => {
    const socket = createSocket();
    const next = jest.fn();

    middleware?.(socket, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it('rejects socket auth when token is invalid', () => {
    const socket = createSocket('bad-token');
    const next = jest.fn();
    verifyMock.mockImplementationOnce(() => {
      throw new UnauthorizedException('Invalid token');
    });

    middleware?.(socket, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it('joins user room when token is valid', () => {
    const socket = createSocket('valid-token');
    const next = jest.fn();
    verifyMock.mockReturnValueOnce({
      sub: 'user-1',
      role: 'USER',
      tokenType: 'socket',
    });

    middleware?.(socket, next);
    gateway.handleConnection(socket as never);

    expect(next).toHaveBeenCalledWith();
    expect(socket.join).toHaveBeenCalledWith('user:user-1');
  });

  it('rejects socket auth when token is not a socket token', () => {
    const socket = createSocket('valid-access-token');
    const next = jest.fn();
    verifyMock.mockReturnValueOnce({ sub: 'user-1', role: 'USER' });

    middleware?.(socket, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it('sends text message via websocket and emits chat:message to participants', async () => {
    const socket = createSocket('valid-token');
    socket.data.authUser = { userId: 'user-1' };
    sendMessageRealtimeMock.mockResolvedValueOnce({
      message: {
        id: 'msg-1',
        senderId: 'user-1',
        receiverId: 'user-2',
        content: 'hello',
        type: 'text',
        createdAt: new Date('2026-03-07T10:00:00.000Z'),
        read: true,
      },
      participantIds: ['user-1', 'user-2'],
    });

    await gateway.handleChatSend(socket as never, {
      conversationId: 'conv-1',
      content: 'hello',
      clientTempId: 'tmp-1',
    });

    expect(sendMessageRealtimeMock).toHaveBeenCalledWith(
      'conv-1',
      { userId: 'user-1' },
      { content: 'hello', imageUrl: undefined, type: undefined },
    );
    expect(toMock).toHaveBeenCalledWith('user:user-1');
    expect(toMock).toHaveBeenCalledWith('user:user-2');
    expect(roomEmitMock).toHaveBeenCalledWith(
      'chat:message',
      expect.objectContaining({
        conversationId: 'conv-1',
        clientTempId: 'tmp-1',
      }),
    );
  });

  it('sends image+caption message via websocket', async () => {
    const socket = createSocket('valid-token');
    socket.data.authUser = { userId: 'user-1' };
    sendMessageRealtimeMock.mockResolvedValueOnce({
      message: {
        id: 'msg-2',
        senderId: 'user-1',
        receiverId: 'user-2',
        content: 'caption',
        type: 'image',
        imageUrl: 'https://cdn.example.com/image.jpg',
        createdAt: new Date('2026-03-07T10:01:00.000Z'),
        read: true,
      },
      participantIds: ['user-1', 'user-2'],
    });

    await gateway.handleChatSend(socket as never, {
      conversationId: 'conv-1',
      content: 'caption',
      imageUrl: 'https://cdn.example.com/image.jpg',
      type: 'image',
      clientTempId: 'tmp-2',
    });

    expect(sendMessageRealtimeMock).toHaveBeenCalledWith(
      'conv-1',
      { userId: 'user-1' },
      {
        content: 'caption',
        imageUrl: 'https://cdn.example.com/image.jpg',
        type: 'image',
      },
    );
    expect(roomEmitMock).toHaveBeenCalledWith(
      'chat:message',
      expect.objectContaining({
        conversationId: 'conv-1',
        clientTempId: 'tmp-2',
      }),
    );
  });

  it('emits chat:error when service rejects empty content and image', async () => {
    const socket = createSocket('valid-token');
    socket.data.authUser = { userId: 'user-1' };
    sendMessageRealtimeMock.mockRejectedValueOnce(
      new BadRequestException('content or imageUrl is required'),
    );

    await gateway.handleChatSend(socket as never, {
      conversationId: 'conv-1',
      clientTempId: 'tmp-3',
      content: '',
    });

    expect(socket.emit).toHaveBeenCalledWith(
      'chat:error',
      expect.objectContaining({
        code: 'BAD_REQUEST',
        message: 'content or imageUrl is required',
        conversationId: 'conv-1',
        clientTempId: 'tmp-3',
      }),
    );
  });
});
