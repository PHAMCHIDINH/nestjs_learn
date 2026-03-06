import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MessageType, Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { mapListingToFrontend } from '../listings/listing.mapper';
import { mapUserToFrontend } from '../users/user.mapper';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { ConversationMessagesQueryDto } from './dto/conversation-messages-query.dto';
import { SendMessageDto } from './dto/send-message.dto';

export type AuthUser = {
  userId: string;
};

type FrontendMessage = {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  type: 'text' | 'image';
  imageUrl?: string;
  createdAt: Date;
  read: boolean;
  productId?: string;
};

type SendMessageResult = {
  message: FrontendMessage;
  participantIds: string[];
};

type ConversationWithRelations = Prisma.ConversationGetPayload<{
  include: {
    listing: {
      include: {
        seller: true;
        category: true;
        images: true;
        favorites: true;
      };
    };
    participants: {
      include: {
        user: true;
      };
    };
    messages: true;
  };
}>;

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findMine(authUser: AuthUser) {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        participants: {
          some: {
            userId: authUser.userId,
          },
        },
      },
      include: this.conversationInclude,
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
    });

    const items: Array<ReturnType<ConversationsService['mapConversation']>> =
      [];
    for (const conversation of conversations) {
      const unreadCount = await this.countUnread(conversation, authUser.userId);
      items.push(
        this.mapConversation(conversation, authUser.userId, unreadCount),
      );
    }

    return items;
  }

  async create(authUser: AuthUser, payload: CreateConversationDto) {
    const listingId = payload.productId?.trim() || null;
    const participantId = payload.participantId.trim();

    if (participantId === authUser.userId) {
      throw new BadRequestException('Cannot create conversation with yourself');
    }

    const participant = await this.prisma.user.findUnique({
      where: { id: participantId },
      select: { id: true },
    });

    if (!participant) {
      throw new NotFoundException('Participant not found');
    }

    if (listingId) {
      const listing = await this.prisma.listing.findUnique({
        where: { id: listingId },
        select: { id: true },
      });
      if (!listing) {
        throw new NotFoundException('Listing not found');
      }
    }

    const existing = await this.prisma.conversation.findFirst({
      where: {
        listingId,
        AND: [
          { participants: { some: { userId: authUser.userId } } },
          { participants: { some: { userId: participantId } } },
          {
            participants: {
              none: {
                userId: {
                  notIn: [authUser.userId, participantId],
                },
              },
            },
          },
        ],
      },
      include: this.conversationInclude,
    });

    if (existing) {
      const unreadCount = await this.countUnread(existing, authUser.userId);
      return this.mapConversation(existing, authUser.userId, unreadCount);
    }

    const conversation = await this.prisma.conversation.create({
      data: {
        listingId,
        participants: {
          create: [{ userId: authUser.userId }, { userId: participantId }],
        },
      },
      include: this.conversationInclude,
    });

    return this.mapConversation(conversation, authUser.userId, 0);
  }

  async findMessages(
    id: string,
    authUser: AuthUser,
    query: ConversationMessagesQueryDto,
  ) {
    const conversation = await this.getConversationParticipantData(
      id,
      authUser.userId,
    );

    const [total, messages] = await this.prisma.$transaction([
      this.prisma.message.count({
        where: { conversationId: id },
      }),
      this.prisma.message.findMany({
        where: { conversationId: id },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    const me = conversation.participants.find(
      (participant) => participant.userId === authUser.userId,
    );
    const otherUserId =
      conversation.participants.find(
        (participant) => participant.userId !== authUser.userId,
      )?.userId ?? authUser.userId;
    const orderedMessages = [...messages].reverse();

    return {
      data: orderedMessages.map((message) =>
        this.mapMessage(
          message,
          authUser.userId,
          otherUserId,
          me?.lastReadAt ?? null,
          conversation.listingId,
        ),
      ),
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async sendMessage(id: string, authUser: AuthUser, payload: SendMessageDto) {
    const result = await this.sendMessageInternal(id, authUser, payload);
    return result.message;
  }

  async sendMessageRealtime(
    id: string,
    authUser: AuthUser,
    payload: SendMessageDto,
  ): Promise<SendMessageResult> {
    return this.sendMessageInternal(id, authUser, payload);
  }

  private async sendMessageInternal(
    id: string,
    authUser: AuthUser,
    payload: SendMessageDto,
  ): Promise<SendMessageResult> {
    const conversation = await this.getConversationParticipantData(
      id,
      authUser.userId,
    );

    const content = payload.content?.trim();
    const imageUrl = payload.imageUrl?.trim();
    if (!content && !imageUrl) {
      throw new BadRequestException('content or imageUrl is required');
    }

    const forcedType = payload.type?.trim().toLowerCase();
    const type =
      forcedType === 'image' || (!forcedType && imageUrl && !content)
        ? MessageType.IMAGE
        : MessageType.TEXT;

    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          conversationId: id,
          senderId: authUser.userId,
          content: content || null,
          imageUrl: imageUrl || null,
          type,
        },
      }),
      this.prisma.conversation.update({
        where: { id },
        data: { lastMessageAt: new Date() },
      }),
    ]);

    const me = conversation.participants.find(
      (participant) => participant.userId === authUser.userId,
    );
    const otherUserId =
      conversation.participants.find(
        (participant) => participant.userId !== authUser.userId,
      )?.userId ?? authUser.userId;

    return {
      message: this.mapMessage(
        message,
        authUser.userId,
        otherUserId,
        me?.lastReadAt ?? null,
        conversation.listingId,
      ),
      participantIds: conversation.participants.map(
        (participant) => participant.userId,
      ),
    };
  }

  async markRead(id: string, authUser: AuthUser) {
    await this.getConversationParticipantData(id, authUser.userId);

    await this.prisma.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId: id,
          userId: authUser.userId,
        },
      },
      data: {
        lastReadAt: new Date(),
      },
    });

    return { message: 'Conversation marked as read' };
  }

  private get conversationInclude() {
    return {
      listing: {
        include: {
          seller: true,
          category: true,
          images: {
            orderBy: {
              order: 'asc' as const,
            },
          },
          favorites: true,
        },
      },
      participants: {
        include: {
          user: true,
        },
      },
      messages: {
        orderBy: {
          createdAt: 'desc' as const,
        },
        take: 1,
      },
    };
  }

  private async getConversationParticipantData(
    conversationId: string,
    userId: string,
  ) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        participants: {
          some: {
            userId,
          },
        },
      },
      include: {
        participants: true,
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return conversation;
  }

  private async countUnread(
    conversation: ConversationWithRelations,
    userId: string,
  ) {
    const me = conversation.participants.find(
      (participant) => participant.userId === userId,
    );

    return this.prisma.message.count({
      where: {
        conversationId: conversation.id,
        senderId: { not: userId },
        ...(me?.lastReadAt
          ? {
              createdAt: { gt: me.lastReadAt },
            }
          : {}),
      },
    });
  }

  private mapConversation(
    conversation: ConversationWithRelations,
    currentUserId: string,
    unreadCount: number,
  ) {
    const me = conversation.participants.find(
      (participant) => participant.userId === currentUserId,
    );
    const lastMessage = conversation.messages[0];
    const otherUserId =
      conversation.participants.find(
        (participant) => participant.userId !== currentUserId,
      )?.userId ?? currentUserId;

    return {
      id: conversation.id,
      participants: conversation.participants.map((participant) =>
        mapUserToFrontend(participant.user),
      ),
      product: conversation.listing
        ? mapListingToFrontend(conversation.listing, currentUserId)
        : undefined,
      lastMessage: lastMessage
        ? this.mapMessage(
            lastMessage,
            currentUserId,
            otherUserId,
            me?.lastReadAt ?? null,
            conversation.listingId,
          )
        : undefined,
      unreadCount,
      updatedAt: conversation.lastMessageAt ?? conversation.createdAt,
    };
  }

  private mapMessage(
    message: {
      id: string;
      senderId: string;
      content: string | null;
      type: MessageType;
      imageUrl: string | null;
      createdAt: Date;
    },
    currentUserId: string,
    otherUserId: string,
    myLastReadAt: Date | null,
    listingId: string | null,
  ): FrontendMessage {
    return {
      id: message.id,
      senderId: message.senderId,
      receiverId:
        message.senderId === currentUserId ? otherUserId : currentUserId,
      content: message.content ?? '',
      type: message.type === MessageType.IMAGE ? 'image' : 'text',
      imageUrl: message.imageUrl ?? undefined,
      createdAt: message.createdAt,
      read:
        message.senderId === currentUserId
          ? true
          : myLastReadAt
            ? message.createdAt <= myLastReadAt
            : false,
      productId: listingId ?? undefined,
    };
  }
}
