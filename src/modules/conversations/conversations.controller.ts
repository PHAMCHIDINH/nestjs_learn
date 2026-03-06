import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { ConversationMessagesQueryDto } from './dto/conversation-messages-query.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { ConversationsService } from './conversations.service';

type AuthUser = {
  userId: string;
};

@ApiTags('Conversations')
@ApiBearerAuth('bearer')
@Controller('conversations')
@UseGuards(AuthGuard)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get conversations for current user' })
  findMine(@CurrentUser() authUser: AuthUser) {
    return this.conversationsService.findMine(authUser);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create conversation' })
  create(
    @CurrentUser() authUser: AuthUser,
    @Body() payload: CreateConversationDto,
  ) {
    return this.conversationsService.create(authUser, payload);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Get messages in a conversation' })
  findMessages(
    @Param('id') id: string,
    @CurrentUser() authUser: AuthUser,
    @Query() query: ConversationMessagesQueryDto,
  ) {
    return this.conversationsService.findMessages(id, authUser, query);
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send message to a conversation' })
  sendMessage(
    @Param('id') id: string,
    @CurrentUser() authUser: AuthUser,
    @Body() payload: SendMessageDto,
  ) {
    return this.conversationsService.sendMessage(id, authUser, payload);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark conversation as read' })
  markRead(@Param('id') id: string, @CurrentUser() authUser: AuthUser) {
    return this.conversationsService.markRead(id, authUser);
  }
}
