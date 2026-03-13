import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const ip = typeof req.ip === 'string' ? req.ip : undefined;
    const socket = req.socket as { remoteAddress?: string } | undefined;
    const remoteAddress = socket?.remoteAddress;

    return Promise.resolve(ip ?? remoteAddress ?? 'unknown');
  }
}
