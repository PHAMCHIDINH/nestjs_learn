import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ListingQueryDto } from '../../listings/dto/listing-query.dto';
import { CreateUserDto } from '../dto/create-user.dto';
import { UsersService } from '../services/users.service';

type AuthUser = {
  userId: string;
  role: string;
};

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Post()
  create(@Body() payload: CreateUserDto) {
    return this.usersService.create(payload);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() authUser: AuthUser) {
    return this.usersService.me(authUser);
  }

  @Get('me/listings')
  @UseGuards(AuthGuard)
  myListings(
    @CurrentUser() authUser: AuthUser,
    @Query() query: ListingQueryDto,
  ) {
    return this.usersService.myListings(authUser, query);
  }

  @Get('me/saved-listings')
  @UseGuards(AuthGuard)
  mySavedListings(
    @CurrentUser() authUser: AuthUser,
    @Query() query: ListingQueryDto,
  ) {
    return this.usersService.mySavedListings(authUser, query);
  }
}
