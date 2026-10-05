/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/features/auth/auth.guard';
import { prisma } from '@/lib/db/client';
import { saveFile, ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from '@/lib/storage';

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission('parcha:upload');
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File size exceeds maximum limit' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Save locally safely
    const storageKey = await saveFile(buffer, file.name || 'upload.bin', file.type);

    // Create OCR Job in DB
    const parchaJob = await prisma.parchaJob.create({
      data: {
        uploaderId: user.id,
        originalFilename: file.name || 'upload.bin',
        storageKey,
        mimeType: file.type,
        sizeBytes: file.size,
        status: 'UPLOADED',
      }
    });

    return NextResponse.json({ parchaJob }, { status: 201 });
  } catch (error: any) {
    console.error('[POST /api/v1/parcha-jobs]', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: error.message === 'Forbidden' ? 403 : 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await requirePermission('parcha:read');
    
    // Non-owner staff should only see their own uploads? 
    // Wait, the prompt says: "Cross-user job and image access denial" (Wait, is it strict per user?)
    // Let's make it strict per user for now, or use role base: if STAFF, only own. If OWNER, all.
    // "Prevent users from retrieving jobs or images they are not authorized to access"
    const isOwner = user.role === 'OWNER';
    
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = 20;

    const where = isOwner ? {} : { uploaderId: user.id };

    const items = await prisma.parchaJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        uploaderId: true,
        originalFilename: true,
        status: true,
        errorMessage: true,
        createdAt: true,
        updatedAt: true
      }
    });

    const total = await prisma.parchaJob.count({ where });

    return NextResponse.json({ items, total, page, limit });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: error.message === 'Forbidden' ? 403 : 500 });
  }
}
