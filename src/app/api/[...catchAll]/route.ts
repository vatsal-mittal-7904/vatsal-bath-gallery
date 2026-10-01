import { NextRequest, NextResponse } from 'next/server';
import { AppError } from '@/lib/errors';
import { withApiWrapper } from '@/lib/api-wrapper';

async function notFoundHandler(req: NextRequest): Promise<NextResponse> {
  throw new AppError('Route not found', 404, 'NOT_FOUND');
}

export const GET = withApiWrapper(notFoundHandler);
export const POST = withApiWrapper(notFoundHandler);
export const PUT = withApiWrapper(notFoundHandler);
export const DELETE = withApiWrapper(notFoundHandler);
export const PATCH = withApiWrapper(notFoundHandler);
