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

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requirePermission('parcha:upload');

    const job = await prisma.parchaJob.findUnique({
      where: { id },
      include: {
        rows: {
          orderBy: { sortOrder: 'asc' }
        }
      }
    });

    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    if (user.role !== 'OWNER' && job.uploaderId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    if (job.status !== 'REVIEW_REQUIRED' && job.status !== 'COMPLETED') {
      return NextResponse.json({ error: 'Job is not in review phase' }, { status: 400 });
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is valid
    }

    const targetRowId = body.rowId;
    const targetRows = targetRowId
      ? job.rows.filter(r => r.id === targetRowId)
      : job.rows.filter(r => body.force || !r.confirmedProductId);

    const updates: { id: string; version: number; productId: string; variantId: string | null }[] = [];

    for (const row of targetRows) {
      const result = await MatchingService.suggestCandidates(row);
      if (result.candidates.length > 0) {
        const top = result.candidates[0]!;
        const variantId = top.suggestedVariantId || (top.product.variants?.length === 1 ? top.product.variants[0]?.id ?? null : null);
        updates.push({
          id: row.id,
          version: row.version,
          productId: top.product.id,
          variantId
        });
      }
    }

    // Sort updates by ID ascending for strict lock ordering
    updates.sort((a, b) => a.id.localeCompare(b.id));

    if (updates.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const u of updates) {
          await tx.parchaJobRow.updateMany({
            where: { id: u.id, jobId: id },
            data: {
              confirmedProductId: u.productId,
              confirmedVariantId: u.variantId,
              version: { increment: 1 }
            }
          });
        }
      });
    }

    const updatedJob = await prisma.parchaJob.findUnique({
      where: { id },
      include: {
        rows: {
          orderBy: { sortOrder: 'asc' },
          include: {
            confirmedProduct: true,
            confirmedVariant: true
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      matchedCount: updates.length,
      rows: updatedJob?.rows || []
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: error.message === 'Forbidden' ? 403 : 500 });
  }
}

