import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('listings/pending')
  pendingListings() {
    return this.adminService.pendingListings();
  }

  @Post('listings/:id/approve')
  approveListing(@Param('id') id: string) {
    return this.adminService.approveListing(id);
  }

  @Post('listings/:id/reject')
  rejectListing(@Param('id') id: string) {
    return this.adminService.rejectListing(id);
  }

  @Get('reports')
  reports(@Query('status') status?: string) {
    return this.adminService.reports(status);
  }

  @Post('reports/:id/resolve')
  resolveReport(@Param('id') id: string) {
    return this.adminService.resolveReport(id);
  }

  @Post('reports/:id/dismiss')
  dismissReport(@Param('id') id: string) {
    return this.adminService.dismissReport(id);
  }
}
