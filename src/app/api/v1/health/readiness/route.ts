import { NextRequest } from 'next/server';
import { withApiWrapper, successResponse } from '@/lib/api-wrapper';
import { prisma } from '@/lib/db/client';
import { AppError } from '@/lib/errors';

async function readinessHandler(req: NextRequest) {
  try {
    // Attempt a simple query to verify database connectivity
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    throw new AppError('Database is not ready', 503, 'SERVICE_UNAVAILABLE');
  }
  return successResponse({ status: 'ready' }, 'Service is ready', 200, req);
}

export const GET = withApiWrapper(readinessHandler);
