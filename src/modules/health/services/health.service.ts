import { Injectable } from '@nestjs/common';
import {
  HealthCheckService,
  type HealthCheckResult,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { PrismaService } from '../../../core/database/prisma.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  async check(): Promise<HealthCheckResult> {
    return this.health.check([
      async () => this.prismaHealth.pingCheck('database', this.prisma),
    ]);
  }

  async liveness(): Promise<HealthCheckResult> {
    return this.health.check([]);
  }

  async readiness(): Promise<HealthCheckResult> {
    return this.health.check([
      async () => this.prismaHealth.pingCheck('database', this.prisma),
    ]);
  }
}
