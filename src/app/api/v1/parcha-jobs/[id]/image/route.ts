/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/features/auth/auth.guard';
import { prisma } from '@/lib/db/client';
import { getFile } from '@/lib/storage';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const user = await requirePermission('parcha:read');
    
    const job = await prisma.parchaJob.findUnique({
      where: { id: id }
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Cross-user access check
    if (user.role !== 'OWNER' && job.uploaderId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const file = await getFile(job.storageKey);
    if (!file) {
      return NextResponse.json({ error: 'Image file not found on server' }, { status: 404 });
    }

    // Return the image securely
    return new NextResponse(file.buffer as unknown as BodyInit, {
      headers: {
        'Content-Type': file.mimeType,
        'Cache-Control': 'private, max-age=86400',
        'Content-Length': file.buffer.length.toString(),
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: error.message === 'Forbidden' ? 403 : 500 });
  }
}
