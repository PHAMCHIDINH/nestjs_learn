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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { ConversationMessagesQueryDto } from './dto/conversation-messages-query.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { ConversationsService } from './conversations.service';

type AuthUser = {
  userId: string;
};

@Controller('conversations')
@UseGuards(AuthGuard)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  findMine(@CurrentUser() authUser: AuthUser) {
    return this.conversationsService.findMine(authUser);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() authUser: AuthUser,
    @Body() payload: CreateConversationDto,
  ) {
    return this.conversationsService.create(authUser, payload);
  }

  @Get(':id/messages')
  findMessages(
    @Param('id') id: string,
    @CurrentUser() authUser: AuthUser,
    @Query() query: ConversationMessagesQueryDto,
  ) {
    return this.conversationsService.findMessages(id, authUser, query);
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  sendMessage(
    @Param('id') id: string,
    @CurrentUser() authUser: AuthUser,
    @Body() payload: SendMessageDto,
  ) {
    return this.conversationsService.sendMessage(id, authUser, payload);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  markRead(@Param('id') id: string, @CurrentUser() authUser: AuthUser) {
    return this.conversationsService.markRead(id, authUser);
  }
}
