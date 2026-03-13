import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import {
  getConfiguredCorsOrigins,
  getCorsOriginOption,
  normalizeOrigin,
} from './cors';

function resolveOriginDecision(
  originOption: CorsOptions['origin'],
  requestOrigin?: string,
): Promise<boolean> {
  if (typeof originOption !== 'function') {
    return Promise.resolve(originOption === true);
  }

  return new Promise((resolve, reject) => {
    originOption(requestOrigin, (error, allowed) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(Boolean(allowed));
    });
  });
}

describe('cors utils', () => {
  it('normalizes trailing slashes and paths to origins', () => {
    expect(normalizeOrigin('http://localhost:3001/')).toBe(
      'http://localhost:3001',
    );
    expect(normalizeOrigin('https://app.example.com/auth/callback')).toBe(
      'https://app.example.com',
    );
  });

  it('deduplicates configured origins after normalization', () => {
    expect(
      getConfiguredCorsOrigins(
        'http://localhost:3001/, http://localhost:3001, https://app.example.com/path',
      ),
    ).toEqual(['http://localhost:3001', 'https://app.example.com']);
  });

  it('allows configured origins after normalization', async () => {
    const originOption = getCorsOriginOption(
      'http://localhost:3001/,https://app.example.com',
      'production',
    );

    await expect(
      resolveOriginDecision(originOption, 'http://localhost:3001'),
    ).resolves.toBe(true);
    await expect(
      resolveOriginDecision(originOption, 'https://app.example.com'),
    ).resolves.toBe(true);
  });

  it('rejects origins outside the allow-list', async () => {
    const originOption = getCorsOriginOption(
      'http://localhost:3001/',
      'production',
    );

    await expect(
      resolveOriginDecision(originOption, 'http://localhost:3002'),
    ).resolves.toBe(false);
  });

  it('disables cors in production when no allow-list is configured', () => {
    expect(getCorsOriginOption('', 'production')).toBe(false);
  });

  it('allows all origins outside production when no allow-list is configured', () => {
    expect(getCorsOriginOption('', 'development')).toBe(true);
  });
});
