import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { ListingQueryDto } from '../../listings/dto/listing-query.dto';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateMeDto } from '../dto/update-me.dto';
import { UsersService } from '../services/users.service';

type AuthUser = {
  userId: string;
  role: string;
};

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Get all users' })
  findAll() {
    return this.usersService.findAll();
  }

  @Post()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Create user' })
  create(@Body() payload: CreateUserDto) {
    return this.usersService.create(payload);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Get current user profile' })
  me(@CurrentUser() authUser: AuthUser) {
    return this.usersService.me(authUser);
  }

  @Patch('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Update current user profile' })
  updateMe(@CurrentUser() authUser: AuthUser, @Body() payload: UpdateMeDto) {
    return this.usersService.updateMe(authUser, payload);
  }

  @Get('me/listings')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Get listings created by current user' })
  myListings(
    @CurrentUser() authUser: AuthUser,
    @Query() query: ListingQueryDto,
  ) {
    return this.usersService.myListings(authUser, query);
  }

  @Get('me/saved-listings')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Get saved listings for current user' })
  mySavedListings(
    @CurrentUser() authUser: AuthUser,
    @Query() query: ListingQueryDto,
  ) {
    return this.usersService.mySavedListings(authUser, query);
  }
}
