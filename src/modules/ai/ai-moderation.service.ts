import { Injectable, Logger } from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { createHash } from 'crypto';
import { z } from 'zod';
import {
  ListingModerationInput,
  ModerationFailureType,
} from './moderation.types';
import { ModerationPolicyService } from './moderation-policy.service';

const moderationOutputSchema = z.object({
  riskLevel: z.enum(['low', 'medium', 'high']),
  confidence: z.number().min(0).max(1),
  violations: z.array(
    z.enum([
      'hang_hoa_cam',
      'spam_lua_dao',
      'noi_dung_doc_hai',
      'dieu_huong_giao_dich_ngoai_nen_tang',
    ]),
  ),
  summary: z.string().min(1).max(500),
  recommendedAction: z.enum(['approve', 'manual_review']),
});

type ModerationEvaluationResult = {
  inputHash: string;
  model: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  confidence: number;
  violations: string[];
  summary: string;
  recommendedAction: 'APPROVE' | 'MANUAL_REVIEW';
  processingMs: number;
};

export class ModerationEvaluationError extends Error {
  constructor(
    message: string,
    readonly failureType: ModerationFailureType,
    readonly processingMs: number,
    readonly model: string,
  ) {
    super(message);
  }
}

@Injectable()
export class AiModerationService {
  private readonly logger = new Logger(AiModerationService.name);
  private readonly enabled = process.env.AI_MODERATION_ENABLED === 'true';
  private readonly model =
    process.env.AI_MODERATION_MODEL?.trim() || 'openrouter/free';
  private readonly timeoutMs = Number.parseInt(
    process.env.AI_MODERATION_TIMEOUT_MS ?? '30000',
    10,
  );
  private readonly apiKey = process.env.OPENROUTER_API_KEY?.trim() || '';
  private readonly baseUrl =
    process.env.OPENROUTER_BASE_URL?.trim() || 'https://openrouter.ai/api/v1';
  private readonly httpReferer =
    process.env.OPENROUTER_HTTP_REFERER?.trim() || undefined;
  private readonly appTitle =
    process.env.OPENROUTER_APP_TITLE?.trim() || undefined;
  private readonly providerRequireParameters =
    process.env.AI_MODERATION_PROVIDER_REQUIRE_PARAMETERS !== 'false';
  private readonly providerSort =
    process.env.AI_MODERATION_PROVIDER_SORT?.trim().toLowerCase() || 'latency';
  private readonly preferredMaxLatencyMs = Number.parseInt(
    process.env.AI_MODERATION_PREFERRED_MAX_LATENCY_MS ?? '20000',
    10,
  );
  private readonly enableResponseHealing =
    process.env.AI_MODERATION_ENABLE_RESPONSE_HEALING !== 'false';

  constructor(private readonly policyService: ModerationPolicyService) {}

  isEnabled() {
    return this.enabled;
  }

  getModelName() {
    return this.model || 'unknown';
  }

  buildInputHash(input: ListingModerationInput) {
    return createHash('sha256')
      .update(
        JSON.stringify({
          title: input.title,
          description: input.description,
          category: input.category,
          department: input.department ?? null,
        }),
      )
      .digest('hex');
  }

  async evaluateListing(
    input: ListingModerationInput,
  ): Promise<ModerationEvaluationResult> {
    const inputHash = this.buildInputHash(input);
    const startedAt = Date.now();
    const structuredModel = new ChatOpenAI({
      model: this.model,
      apiKey: this.apiKey,
      temperature: 0,
      streamUsage: false,
      modelKwargs: this.buildModelKwargs(),
      configuration: {
        baseURL: this.baseUrl,
        defaultHeaders: this.buildHeaders(),
      },
    }).withStructuredOutput(moderationOutputSchema, {
      includeRaw: true,
      name: 'listing_moderation_result',
    });

    try {
      const response = await Promise.race([
        structuredModel.invoke([
          new SystemMessage(this.policyService.getSystemPrompt()),
          new SystemMessage(this.policyService.getPolicyPrompt()),
          new HumanMessage(this.policyService.buildUserPrompt(input)),
        ]),
        this.timeoutAfter(),
      ]);

      const processingMs = Date.now() - startedAt;
      const raw = 'raw' in response && response.raw ? response.raw : undefined;
      const parsed =
        'parsed' in response && response.parsed ? response.parsed : undefined;

      if (!parsed) {
        throw new ModerationEvaluationError(
          'AI moderation returned an empty structured output',
          'PARSE',
          processingMs,
          this.model,
        );
      }

      const resolvedModel = this.resolveModelName(raw);
      this.logger.log(
        `AI moderation completed for listing ${input.id} in ${processingMs}ms using ${resolvedModel}`,
      );

      return {
        inputHash,
        model: resolvedModel,
        riskLevel: this.mapRiskLevel(parsed.riskLevel),
        confidence: parsed.confidence,
        violations: Array.from(new Set(parsed.violations)),
        summary: parsed.summary.trim(),
        recommendedAction: this.mapRecommendedAction(parsed.recommendedAction),
        processingMs,
      };
    } catch (error) {
      const processingMs = Date.now() - startedAt;
      const failure = this.toEvaluationError(error, processingMs);
      this.logger.warn(
        `AI moderation failed for listing ${input.id} after ${processingMs}ms with ${failure.failureType}: ${failure.message}`,
      );
      throw failure;
    }
  }

  private buildHeaders() {
    const headers: Record<string, string> = {};
    if (this.httpReferer) {
      headers['HTTP-Referer'] = this.httpReferer;
    }
    if (this.appTitle) {
      headers['X-Title'] = this.appTitle;
    }
    return headers;
  }

  private buildModelKwargs() {
    const modelKwargs: Record<string, unknown> = {
      provider: {
        require_parameters: this.providerRequireParameters,
        sort: this.providerSort,
        preferred_max_latency: Math.max(
          1,
          Math.round(this.preferredMaxLatencyMs / 1000),
        ),
      },
    };

    if (this.enableResponseHealing) {
      modelKwargs.plugins = [{ id: 'response-healing' }];
    }

    return modelKwargs;
  }

  private mapRiskLevel(
    value: z.infer<typeof moderationOutputSchema>['riskLevel'],
  ) {
    switch (value) {
      case 'low':
        return 'LOW';
      case 'medium':
        return 'MEDIUM';
      case 'high':
      default:
        return 'HIGH';
    }
  }

  private mapRecommendedAction(
    value: z.infer<typeof moderationOutputSchema>['recommendedAction'],
  ) {
    return value === 'approve' ? 'APPROVE' : 'MANUAL_REVIEW';
  }

  private resolveModelName(raw: unknown) {
    if (!raw || typeof raw !== 'object') {
      return this.model;
    }

    const metadata =
      'response_metadata' in raw &&
      raw.response_metadata &&
      typeof raw.response_metadata === 'object'
        ? (raw.response_metadata as Record<string, unknown>)
        : undefined;

    const candidates = [
      metadata?.model_name,
      metadata?.model,
      metadata?.provider,
    ];

    const match = candidates.find(
      (value): value is string =>
        typeof value === 'string' && value.trim().length > 0,
    );

    return match ?? this.model;
  }

  private toEvaluationError(error: unknown, processingMs: number) {
    if (error instanceof ModerationEvaluationError) {
      return error;
    }

    const message =
      error instanceof Error ? error.message : 'AI moderation failed';
    const failureType = this.classifyFailure(message);

    return new ModerationEvaluationError(
      message,
      failureType,
      processingMs,
      this.model,
    );
  }

  private classifyFailure(message: string): ModerationFailureType {
    const normalized = message.toLowerCase();

    if (
      normalized.includes('timed out') ||
      normalized.includes('timeout') ||
      normalized.includes('abort')
    ) {
      return 'TIMEOUT';
    }

    if (
      normalized.includes('parse') ||
      normalized.includes('schema') ||
      normalized.includes('json') ||
      normalized.includes('structured output')
    ) {
      return 'PARSE';
    }

    if (
      normalized.includes('openrouter') ||
      normalized.includes('provider') ||
      normalized.includes('status code') ||
      normalized.includes('api key') ||
      normalized.includes('rate limit') ||
      normalized.includes('network')
    ) {
      return 'PROVIDER';
    }

    return 'UNKNOWN';
  }

  private timeoutAfter() {
    return new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('AI moderation timed out'));
      }, this.timeoutMs);
    });
  }
}
