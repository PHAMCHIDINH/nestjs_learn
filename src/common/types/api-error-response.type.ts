export type ApiErrorResponse = {
  success: false;
  statusCode: number;
  message: string | string[];
  errorCode: string;
  details?: unknown;
  timestamp: string;
  path: string;
  requestId?: string;
};
