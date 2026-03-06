import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { catchError, tap, throwError } from 'rxjs';

type RequestWithId = Request & {
  requestId?: string;
};

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler) {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<Response>();

    const requestId = this.resolveRequestId(request);
    request.requestId = requestId;
    response.setHeader('x-request-id', requestId);

    const startedAt = Date.now();
    const method = request.method;
    const url = request.originalUrl ?? request.url;

    return next.handle().pipe(
      tap(() => {
        this.logger.log(
          `${method} ${url} ${response.statusCode} ${Date.now() - startedAt}ms requestId=${requestId}`,
        );
      }),
      catchError((error: unknown) => {
        const statusCode =
          response.statusCode >= 400 ? response.statusCode : 500;
        this.logger.warn(
          `${method} ${url} ${statusCode} ${Date.now() - startedAt}ms requestId=${requestId}`,
        );
        return throwError(() => error);
      }),
    );
  }

  private resolveRequestId(request: Request): string {
    const header = request.headers['x-request-id'];
    if (typeof header === 'string' && header.trim().length > 0) {
      return header.trim();
    }
    if (Array.isArray(header) && header.length > 0 && header[0].trim().length) {
      return header[0].trim();
    }

    return randomUUID();
  }
}
