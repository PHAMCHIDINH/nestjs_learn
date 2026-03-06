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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { OptionalAuthGuard } from '../../common/guards/optional-auth.guard';
import { CreateListingDto } from './dto/create-listing.dto';
import { ListingQueryDto } from './dto/listing-query.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { ListingsService } from './listings.service';

type AuthUser = {
  userId: string;
  role: string;
};

@ApiTags('Listings')
@Controller('listings')
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  @Post()
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Create listing' })
  create(@Body() payload: CreateListingDto, @CurrentUser() authUser: AuthUser) {
    return this.listingsService.create(payload, authUser);
  }

  @Get()
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: 'Get listings with filters' })
  findAll(@Query() query: ListingQueryDto, @CurrentUser() authUser?: AuthUser) {
    return this.listingsService.findAll(query, authUser);
  }

  @Get('seller/:sellerId')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: 'Get listings by seller' })
  findBySeller(
    @Param('sellerId') sellerId: string,
    @Query() query: ListingQueryDto,
    @CurrentUser() authUser?: AuthUser,
  ) {
    return this.listingsService.findBySeller(sellerId, query, authUser);
  }

  @Get(':id')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: 'Get listing detail' })
  findOne(@Param('id') id: string, @CurrentUser() authUser?: AuthUser) {
    return this.listingsService.findOne(id, authUser);
  }

  @Patch(':id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Update listing' })
  update(
    @Param('id') id: string,
    @Body() payload: UpdateListingDto,
    @CurrentUser() authUser: AuthUser,
  ) {
    return this.listingsService.update(id, payload, authUser);
  }

  @Patch(':id/status')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Update listing status' })
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
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Delete listing' })
  remove(@Param('id') id: string, @CurrentUser() authUser: AuthUser) {
    return this.listingsService.remove(id, authUser);
  }

  @Post(':id/save')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Save listing for current user' })
  save(@Param('id') id: string, @CurrentUser() authUser: AuthUser) {
    return this.listingsService.saveListing(id, authUser);
  }

  @Delete(':id/save')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Unsave listing for current user' })
  unsave(@Param('id') id: string, @CurrentUser() authUser: AuthUser) {
    return this.listingsService.unsaveListing(id, authUser);
  }
}
