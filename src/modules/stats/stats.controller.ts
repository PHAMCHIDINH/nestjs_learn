import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { StatsService } from './stats.service';

@ApiTags('Stats')
@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('public')
  @ApiOperation({ summary: 'Get public platform stats' })
  getPublicStats() {
    return this.statsService.getPublicStats();
  }
}
