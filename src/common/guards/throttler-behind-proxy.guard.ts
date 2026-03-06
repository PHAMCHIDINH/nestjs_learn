import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const headers = req.headers as Record<
      string,
      string | string[] | undefined
    >;
    const forwardedFor = headers?.['x-forwarded-for'];

    if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
      return Promise.resolve(forwardedFor.split(',')[0].trim());
    }

    if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
      return Promise.resolve(forwardedFor[0]);
    }

    const ip = typeof req.ip === 'string' ? req.ip : undefined;
    const socket = req.socket as { remoteAddress?: string } | undefined;
    const remoteAddress = socket?.remoteAddress;

    return Promise.resolve(ip ?? remoteAddress ?? 'unknown');
  }
}
