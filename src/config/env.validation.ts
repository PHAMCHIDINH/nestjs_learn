type EnvironmentRecord = Record<string, unknown>;

const NODE_ENV_VALUES = new Set(['development', 'production', 'test']);
const DURATION_PATTERN = /^\d+(ms|s|m|h|d|w)$/i;
const TRUST_PROXY_KEYWORDS = new Set([
  'loopback',
  'linklocal',
  'uniquelocal',
]);
const JWT_SECRET_PLACEHOLDERS = new Set([
  'dev-secret',
  'test-secret',
  'change-me-in-production',
  'replace-with-a-long-random-secret',
]);

const readString = (input: unknown): string | undefined => {
  if (typeof input !== 'string') {
    return undefined;
  }

  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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

const parseNodeEnv = (value: unknown): 'development' | 'production' | 'test' => {
  const normalized = readString(value)?.toLowerCase() ?? 'development';
  if (!NODE_ENV_VALUES.has(normalized)) {
    throw new Error('NODE_ENV must be one of development, production, test');
  }

  return normalized as 'development' | 'production' | 'test';
};

const parseDuration = (value: unknown, key: string, fallback: string): string => {
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

  return {
    ...config,
    NODE_ENV: nodeEnv,
    PORT: parsePositiveInteger(config.PORT, 'PORT', 3000),
    JWT_SECRET: jwtSecret,
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
    TRUST_PROXY: parseTrustProxy(config.TRUST_PROXY),
  };
};
