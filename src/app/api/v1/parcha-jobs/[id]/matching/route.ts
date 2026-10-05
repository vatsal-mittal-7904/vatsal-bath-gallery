/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/features/auth/auth.guard';
import { prisma } from '@/lib/db/client';
import { MatchingService } from '@/features/parcha/matching.service';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requirePermission('parcha:read');
    
    // Check job ownership/permission
    const job = await prisma.parchaJob.findUnique({
      where: { id },
      include: { rows: true }
    });

    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    if (user.role !== 'OWNER' && job.uploaderId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const rowId = req.nextUrl.searchParams.get('rowId');
    if (!rowId) return NextResponse.json({ error: 'rowId is required' }, { status: 400 });

    const row = job.rows.find(r => r.id === rowId);
    if (!row) return NextResponse.json({ error: 'Row not found in this job' }, { status: 404 });

    const result = await MatchingService.suggestCandidates(row);

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: error.message === 'Forbidden' ? 403 : 500 });
  }
}
