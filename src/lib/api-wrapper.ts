/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { logger } from './logger';
import { AppError } from './errors';
import { z } from 'zod';

export type ApiHandler = (req: NextRequest, ctx: any) => Promise<NextResponse> | NextResponse;

export function withApiWrapper(handler: ApiHandler) {
  return async (req: NextRequest, ctx: any): Promise<NextResponse> => {
    const start = Date.now();
    const requestId = req.headers.get('x-request-id') || crypto.randomUUID();
    const method = req.method;
    const url = req.url;

    try {
      const response = await handler(req, ctx);
      const duration = Date.now() - start;

      logger.info({
        requestId,
        method,
        url,
        statusCode: response.status,
        duration,
      }, 'Request completed');

      // Intercept JSON responses to ensure they have the request ID if they are structured objects
      // Note: In Next.js, NextResponse.json is often used directly in handlers. We assume handlers use our success wrapper or format correctly.
      return response;
    } catch (error: unknown) {
      const duration = Date.now() - start;
      let statusCode = 500;
      let errorResponse = {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
        details: undefined as unknown,
      };

      if (error instanceof AppError) {
        statusCode = error.statusCode;
        errorResponse = {
          code: error.code,
          message: error.message,
          details: error.details,
        };
      } else if (error instanceof z.ZodError) {
        statusCode = 400;
        errorResponse = {
          code: 'VALIDATION_ERROR',
          message: 'The request is invalid',
          details: error.format(),
        };
      } else {
        logger.error({ err: error, requestId }, 'Unhandled exception');
      }

      logger.info({
        requestId,
        method,
        url,
        statusCode,
        duration,
        error: errorResponse.code,
      }, 'Request failed');

      return NextResponse.json({
        success: false,
        error: errorResponse,
        requestId,
      }, { status: statusCode });
    }
  };
}

export function successResponse(data: unknown, message: string = 'Request completed', status: number = 200, req?: NextRequest) {
  const requestId = req?.headers.get('x-request-id') || 'any';
  return NextResponse.json({
    success: true,
    data,
    message,
    requestId,
  }, { status });
}
