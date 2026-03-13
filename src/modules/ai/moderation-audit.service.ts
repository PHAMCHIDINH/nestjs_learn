import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import {
  ModerationFailureType,
  ModerationResultView,
} from './moderation.types';

type CreateModerationSuccessInput = {
  listingId: string;
  model: string;
  inputHash: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  confidence: number | null;
  violations: string[];
  summary: string | null;
  recommendedAction: 'APPROVE' | 'MANUAL_REVIEW' | null;
  appliedAction: 'APPROVED' | 'PENDING';
  processingMs: number;
};

type CreateModerationErrorInput = {
  listingId: string;
  model: string;
  inputHash: string;
  processingMs: number;
  failureType: ModerationFailureType;
  errorMessage: string;
};

@Injectable()
export class ModerationAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async createSuccess(input: CreateModerationSuccessInput) {
    return this.prisma.listingModerationRun.create({
      data: {
        listingId: input.listingId,
        model: input.model,
        inputHash: input.inputHash,
        riskLevel: input.riskLevel,
        confidence: input.confidence,
        violationsJson: input.violations,
        summary: input.summary,
        recommendedAction: input.recommendedAction,
        appliedAction: input.appliedAction,
        processingMs: input.processingMs,
        status: 'SUCCESS',
      },
    });
  }

  async createError(input: CreateModerationErrorInput) {
    return this.prisma.listingModerationRun.create({
      data: {
        listingId: input.listingId,
        model: input.model,
        inputHash: input.inputHash,
        riskLevel: 'ERROR',
        violationsJson: [],
        status: 'ERROR',
        processingMs: input.processingMs,
        failureType: input.failureType,
        errorMessage: input.errorMessage,
        appliedAction: 'PENDING',
      },
    });
  }

  async latestForListing(listingId: string) {
    return this.prisma.listingModerationRun.findFirst({
      where: { listingId },
      orderBy: { createdAt: 'desc' },
    });
  }

  mapRunToView(
    run?: Prisma.ListingModerationRunGetPayload<Record<string, never>> | null,
  ): ModerationResultView | undefined {
    if (!run) {
      return undefined;
    }

    return {
      riskLevel:
        run.riskLevel.toLowerCase() as ModerationResultView['riskLevel'],
      confidence: run.confidence ?? null,
      recommendedAction:
        run.recommendedAction?.toLowerCase() as ModerationResultView['recommendedAction'],
      summary: run.summary ?? null,
      violations: Array.isArray(run.violationsJson)
        ? run.violationsJson.filter(
            (value): value is string => typeof value === 'string',
          )
        : [],
      createdAt: run.createdAt,
    };
  }
}
