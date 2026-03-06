import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import type { ApiErrorResponse } from '../types/api-error-response.type';

type RequestWithId = Request & {
  requestId?: string;
};

type NormalizedException = {
  statusCode: number;
  message: string | string[];
  errorCode: string;
  details?: unknown;
  stack?: string;
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<RequestWithId>();
    const normalized = this.normalizeException(exception);

    const body: ApiErrorResponse = {
      success: false,
      statusCode: normalized.statusCode,
      message: normalized.message,
      errorCode: normalized.errorCode,
      details: normalized.details,
      timestamp: new Date().toISOString(),
      path: request.originalUrl ?? request.url,
      requestId: request.requestId,
    };

    if (normalized.statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${normalized.statusCode}`,
        normalized.stack,
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} -> ${normalized.statusCode}`,
      );
    }

    response.status(normalized.statusCode).json(body);
  }

  private normalizeException(exception: unknown): NormalizedException {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const response = exception.getResponse();
      let message: string | string[] = exception.message;
      let details: unknown;
      let errorCode = this.statusToErrorCode(statusCode);

      if (typeof response === 'string') {
        message = response;
      } else if (this.isRecord(response)) {
        const responseMessage = response.message;
        if (
          typeof responseMessage === 'string' ||
          Array.isArray(responseMessage)
        ) {
          message = responseMessage as string | string[];
        }
        if (typeof response.error === 'string') {
          errorCode = this.toErrorCode(response.error);
        }
        details = response;
      }

      return {
        statusCode,
        message,
        errorCode,
        details,
        stack: exception.stack,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Database request failed',
        errorCode: 'DATABASE_ERROR',
        details: {
          code: exception.code,
          meta: exception.meta,
        },
        stack: exception.stack,
      };
    }

    if (exception instanceof Error) {
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
        errorCode: 'INTERNAL_SERVER_ERROR',
        details: {
          name: exception.name,
          message: exception.message,
        },
        stack: exception.stack,
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      errorCode: 'INTERNAL_SERVER_ERROR',
      details: exception,
    };
  }

  private statusToErrorCode(statusCode: number): string {
    switch (statusCode) {
      case 400:
        return 'BAD_REQUEST';
      case 401:
        return 'UNAUTHORIZED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 409:
        return 'CONFLICT';
      case 429:
        return 'TOO_MANY_REQUESTS';
      default:
        return 'HTTP_ERROR';
    }
  }

  private toErrorCode(value: string): string {
    return value.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
