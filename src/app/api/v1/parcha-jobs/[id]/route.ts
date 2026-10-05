/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/features/auth/auth.guard';
import { prisma } from '@/lib/db/client';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const user = await requirePermission('parcha:read');
    
    const job = await prisma.parchaJob.findUnique({
      where: { id: id },
      select: {
        id: true,
        uploaderId: true,
        originalFilename: true,
        mimeType: true,
        sizeBytes: true,
        status: true,
        errorMessage: true,
        createdAt: true,
        updatedAt: true,
        processingStartedAt: true,
        processingCompletedAt: true,
      }
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Cross-user access check
    if (user.role !== 'OWNER' && job.uploaderId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ parchaJob: job });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: error.message === 'Forbidden' ? 403 : 500 });
  }
}
