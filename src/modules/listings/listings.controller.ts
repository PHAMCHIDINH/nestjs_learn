import {
  Body,
  Controller,
  Delete,
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
import { CreateListingDto } from './dto/create-listing.dto';
import { ListingQueryDto } from './dto/listing-query.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { ListingsService } from './listings.service';

type AuthUser = {
  userId: string;
  role: string;
};

@Controller('listings')
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  @Post()
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() payload: CreateListingDto, @CurrentUser() authUser: AuthUser) {
    return this.listingsService.create(payload, authUser);
  }

  @Get()
  findAll(@Query() query: ListingQueryDto) {
    return this.listingsService.findAll(query);
  }

  @Get('seller/:sellerId')
  findBySeller(
    @Param('sellerId') sellerId: string,
    @Query() query: ListingQueryDto,
  ) {
    return this.listingsService.findBySeller(sellerId, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.listingsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard)
  update(
    @Param('id') id: string,
    @Body() payload: UpdateListingDto,
    @CurrentUser() authUser: AuthUser,
  ) {
    return this.listingsService.update(id, payload, authUser);
  }

  @Patch(':id/status')
  @UseGuards(AuthGuard)
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @CurrentUser() authUser: AuthUser,
  ) {
    return this.listingsService.updateStatus(id, status, authUser);
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string, @CurrentUser() authUser: AuthUser) {
    return this.listingsService.remove(id, authUser);
  }

  @Post(':id/save')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  save(@Param('id') id: string, @CurrentUser() authUser: AuthUser) {
    return this.listingsService.saveListing(id, authUser);
  }

  @Delete(':id/save')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  unsave(@Param('id') id: string, @CurrentUser() authUser: AuthUser) {
    return this.listingsService.unsaveListing(id, authUser);
  }
}
