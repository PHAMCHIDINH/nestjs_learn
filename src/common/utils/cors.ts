import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

export function normalizeOrigin(origin: string): string {
  const trimmedOrigin = origin.trim();
  if (!trimmedOrigin) {
    return '';
  }

  try {
    return new URL(trimmedOrigin).origin;
  } catch {
    return trimmedOrigin.replace(/\/+$/, '');
  }
}

export function getConfiguredCorsOrigins(
  rawOrigins = process.env.CORS_ORIGIN ?? '',
): string[] {
  return [
    ...new Set(rawOrigins.split(',').map(normalizeOrigin).filter(Boolean)),
  ];
}

export function getCorsOriginOption(
  rawOrigins = process.env.CORS_ORIGIN ?? '',
  nodeEnv = process.env.NODE_ENV,
): CorsOptions['origin'] {
  const configuredOrigins = getConfiguredCorsOrigins(rawOrigins);

  if (configuredOrigins.length === 0) {
    return nodeEnv === 'production' ? false : true;
  }

  return (requestOrigin, callback) => {
    if (!requestOrigin) {
      callback(null, true);
      return;
    }

    callback(null, configuredOrigins.includes(normalizeOrigin(requestOrigin)));
  };
}
