import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ListingQueryDto } from '../listings/dto/listing-query.dto';
import { AdminService } from './admin.service';

@ApiTags('Admin')
@ApiBearerAuth('bearer')
@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('listings/pending')
  @ApiOperation({ summary: 'Get pending listings' })
  pendingListings(@Query() query: ListingQueryDto) {
    return this.adminService.pendingListings(query);
  }

  @Post('listings/:id/approve')
  @ApiOperation({ summary: 'Approve listing' })
  approveListing(@Param('id') id: string) {
    return this.adminService.approveListing(id);
  }

  @Post('listings/:id/reject')
  @ApiOperation({ summary: 'Reject listing' })
  rejectListing(@Param('id') id: string) {
    return this.adminService.rejectListing(id);
  }

  @Post('listings/:id/moderation/rerun')
  @ApiOperation({ summary: 'Rerun AI moderation for a listing' })
  rerunModeration(@Param('id') id: string) {
    return this.adminService.rerunModeration(id);
  }

  @Get('reports')
  @ApiOperation({ summary: 'Get reports' })
  reports(@Query() query: ListingQueryDto) {
    return this.adminService.reports(query);
  }

  @Post('reports/:id/resolve')
  @ApiOperation({ summary: 'Resolve report' })
  resolveReport(@Param('id') id: string) {
    return this.adminService.resolveReport(id);
  }

  @Post('reports/:id/dismiss')
  @ApiOperation({ summary: 'Dismiss report' })
  dismissReport(@Param('id') id: string) {
    return this.adminService.dismissReport(id);
  }
}
