type EnvironmentRecord = Record<string, unknown>;

const NODE_ENV_VALUES = new Set(['development', 'production', 'test']);
const DURATION_PATTERN = /^\d+(ms|s|m|h|d|w)$/i;
const TRUST_PROXY_KEYWORDS = new Set(['loopback', 'linklocal', 'uniquelocal']);
const JWT_SECRET_PLACEHOLDERS = new Set([
  'dev-secret',
  'test-secret',
  'change-me-in-production',
  'replace-with-a-long-random-secret',
]);
const OPENROUTER_PROVIDER_SORT_VALUES = new Set([
  'latency',
  'price',
  'throughput',
]);

const readString = (input: unknown): string | undefined => {
  if (typeof input !== 'string') {
    return undefined;
  }

  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const parseBoolean = (value: unknown, fallback: boolean): boolean => {
  const raw = readString(value);
  if (!raw) {
    return fallback;
  }

  const normalized = raw.toLowerCase();
  if (['true', '1', 'on', 'yes'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'off', 'no'].includes(normalized)) {
    return false;
  }

  throw new Error('Expected a boolean value');
};

const parsePositiveInteger = (
  value: unknown,
  key: string,
  fallback?: number,
): number => {
  const raw = readString(value);
  if (!raw) {
    if (fallback !== undefined) {
      return fallback;
    }

    throw new Error(`${key} is required`);
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }

  return parsed;
};

const parseNodeEnv = (
  value: unknown,
): 'development' | 'production' | 'test' => {
  const normalized = readString(value)?.toLowerCase() ?? 'development';
  if (!NODE_ENV_VALUES.has(normalized)) {
    throw new Error('NODE_ENV must be one of development, production, test');
  }

  return normalized as 'development' | 'production' | 'test';
};

const parseDuration = (
  value: unknown,
  key: string,
  fallback: string,
): string => {
  const raw = readString(value) ?? fallback;
  if (/^\d+$/.test(raw) || DURATION_PATTERN.test(raw)) {
    return raw;
  }

  throw new Error(
    `${key} must be a positive integer in seconds or a duration like 15m, 24h, 7d`,
  );
};

const parseTrustProxy = (value: unknown): boolean | number | string => {
  const raw = readString(value);
  if (!raw) {
    return false;
  }

  const normalized = raw.toLowerCase();
  if (['false', '0', 'off', 'no'].includes(normalized)) {
    return false;
  }

  if (['true', '1', 'on', 'yes'].includes(normalized)) {
    return true;
  }

  if (/^\d+$/.test(normalized)) {
    return Number.parseInt(normalized, 10);
  }

  if (TRUST_PROXY_KEYWORDS.has(normalized)) {
    return normalized;
  }

  throw new Error(
    'TRUST_PROXY must be false, true, a hop count, or one of loopback/linklocal/uniquelocal',
  );
};

const parseOpenRouterProviderSort = (
  value: unknown,
  fallback: string,
): string => {
  const normalized = (readString(value) ?? fallback).toLowerCase();
  if (!OPENROUTER_PROVIDER_SORT_VALUES.has(normalized)) {
    throw new Error(
      'AI_MODERATION_PROVIDER_SORT must be one of latency, price, throughput',
    );
  }

  return normalized;
};

export const parseDurationToMs = (value: string): number => {
  const trimmed = value.trim().toLowerCase();
  if (/^\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10) * 1000;
  }

  const match = trimmed.match(/^(\d+)(ms|s|m|h|d|w)$/);
  if (!match) {
    throw new Error(
      `Invalid duration value "${value}". Expected seconds or units ms/s/m/h/d/w.`,
    );
  }

  const amount = Number.parseInt(match[1], 10);
  const unit = match[2];
  const multiplier: Record<string, number> = {
    ms: 1,
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
  };

  return amount * multiplier[unit];
};

export const validateEnvironment = (config: EnvironmentRecord) => {
  const nodeEnv = parseNodeEnv(config.NODE_ENV);
  const jwtSecret = readString(config.JWT_SECRET);
  const aiModerationEnabled = parseBoolean(config.AI_MODERATION_ENABLED, false);
  const aiModerationModel =
    readString(config.AI_MODERATION_MODEL) ?? 'openrouter/free';
  const openRouterApiKey = readString(config.OPENROUTER_API_KEY);
  const aiAutoApproveConfidenceMin = Number.parseFloat(
    readString(config.AI_AUTO_APPROVE_CONFIDENCE_MIN) ?? '0.85',
  );

  if (!jwtSecret) {
    throw new Error('JWT_SECRET is required');
  }

  if (
    nodeEnv !== 'test' &&
    JWT_SECRET_PLACEHOLDERS.has(jwtSecret.toLowerCase())
  ) {
    throw new Error(
      'JWT_SECRET must be replaced with a strong secret outside test environments',
    );
  }

  if (aiModerationEnabled) {
    if (!openRouterApiKey) {
      throw new Error(
        'OPENROUTER_API_KEY is required when AI moderation is enabled',
      );
    }

    if (!aiModerationModel) {
      throw new Error(
        'AI_MODERATION_MODEL is required when AI moderation is enabled',
      );
    }
  }

  if (
    Number.isNaN(aiAutoApproveConfidenceMin) ||
    aiAutoApproveConfidenceMin < 0 ||
    aiAutoApproveConfidenceMin > 1
  ) {
    throw new Error(
      'AI_AUTO_APPROVE_CONFIDENCE_MIN must be a number between 0 and 1',
    );
  }

  return {
    ...config,
    NODE_ENV: nodeEnv,
    PORT: parsePositiveInteger(config.PORT, 'PORT', 3000),
    ['JWT_SECRET']: jwtSecret,
    JWT_EXPIRES_IN: parseDuration(
      config.JWT_EXPIRES_IN,
      'JWT_EXPIRES_IN',
      '7d',
    ),
    OTP_EXPIRES_MINUTES: parsePositiveInteger(
      config.OTP_EXPIRES_MINUTES,
      'OTP_EXPIRES_MINUTES',
      5,
    ),
    AI_MODERATION_ENABLED: aiModerationEnabled,
    OPENROUTER_API_KEY: openRouterApiKey,
    OPENROUTER_BASE_URL:
      readString(config.OPENROUTER_BASE_URL) ?? 'https://openrouter.ai/api/v1',
    AI_MODERATION_MODEL: aiModerationModel,
    AI_MODERATION_TIMEOUT_MS: parsePositiveInteger(
      config.AI_MODERATION_TIMEOUT_MS,
      'AI_MODERATION_TIMEOUT_MS',
      30000,
    ),
    AI_AUTO_APPROVE_CONFIDENCE_MIN: aiAutoApproveConfidenceMin,
    AI_MODERATION_PROVIDER_REQUIRE_PARAMETERS: parseBoolean(
      config.AI_MODERATION_PROVIDER_REQUIRE_PARAMETERS,
      true,
    ),
    AI_MODERATION_PROVIDER_SORT: parseOpenRouterProviderSort(
      config.AI_MODERATION_PROVIDER_SORT,
      'latency',
    ),
    AI_MODERATION_PREFERRED_MAX_LATENCY_MS: parsePositiveInteger(
      config.AI_MODERATION_PREFERRED_MAX_LATENCY_MS,
      'AI_MODERATION_PREFERRED_MAX_LATENCY_MS',
      20000,
    ),
    AI_MODERATION_ENABLE_RESPONSE_HEALING: parseBoolean(
      config.AI_MODERATION_ENABLE_RESPONSE_HEALING,
      true,
    ),
    OPENROUTER_HTTP_REFERER: readString(config.OPENROUTER_HTTP_REFERER),
    OPENROUTER_APP_TITLE: readString(config.OPENROUTER_APP_TITLE),
    TRUST_PROXY: parseTrustProxy(config.TRUST_PROXY),
  };
};
