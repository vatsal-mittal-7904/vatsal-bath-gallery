/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/v1/parcha-jobs/[id]/process/route';
import { prisma } from '@/lib/db/client';
import { NextRequest } from 'next/server';
import { GeminiOcrProvider } from '@/features/parcha/providers/gemini-ocr.provider';
import { requirePermission } from '@/features/auth/auth.guard';
import { getFile } from '@/lib/storage';

vi.mock('@/lib/db/client', () => ({
  prisma: {
    parchaJob: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    parchaJobRow: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn(async (cb) => {
      return await cb(prisma);
    })
  }
}));

vi.mock('@/features/auth/auth.guard', () => ({
  requirePermission: vi.fn()
}));

vi.mock('@/lib/storage', () => ({
  getFile: vi.fn().mockResolvedValue({ buffer: Buffer.from('fake'), mimeType: 'image/png' })
}));

vi.mock('@/features/parcha/providers/gemini-ocr.provider', () => ({
  GeminiOcrProvider: vi.fn().mockImplementation(function() {
    return {
      getProviderName: () => 'google:gemini',
      getModelName: () => 'gemini-1.5-flash',
      extractFromImage: vi.fn().mockResolvedValue({ rawText: 'text', items: [] })
    };
  })
}));

describe('Parcha Processing Concurrency Race', () => {
  const jobId = 'job-123';

  beforeEach(() => {
    vi.clearAllMocks();
    (requirePermission as import('vitest').Mock).mockResolvedValue({ id: 'user1', role: 'OWNER' });
  });

  it('atomically claims the job and fences writes using processingToken', async () => {
    (prisma.parchaJob.findUnique as import('vitest').Mock)
      .mockResolvedValueOnce({
        id: jobId,
        status: 'UPLOADED',
        uploaderId: 'user1',
        processingToken: null
      })
      .mockResolvedValueOnce({
        id: jobId,
        storageKey: 'fake.jpg',
        status: 'PROCESSING'
      });

    (prisma.parchaJob.updateMany as import('vitest').Mock)
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });

    (prisma.parchaJobRow.findMany as import('vitest').Mock).mockResolvedValue([]);

    const req = new NextRequest('http://localhost/api');
    const res = await POST(req, { params: Promise.resolve({ id: jobId }) });
    
    if(res.status !== 200) console.log(await res.json()); 
    expect(res.status).toBe(200);
    expect(prisma.parchaJob.updateMany).toHaveBeenCalledTimes(2); 
  });

  it('safely exits if updateMany count is 0 (lost claim during transaction)', async () => {
    (prisma.parchaJob.findUnique as import('vitest').Mock)
      .mockResolvedValueOnce({
        id: jobId,
        status: 'PROCESSING',
        uploaderId: 'user1',
        processingStartedAt: new Date(Date.now() - 6 * 60 * 1000) 
      })
      .mockResolvedValueOnce({
        id: jobId,
        storageKey: 'fake.jpg',
        status: 'PROCESSING'
      });

    (prisma.parchaJob.updateMany as import('vitest').Mock)
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 }); // Crucially fails here!
    
    (prisma.parchaJobRow.findMany as import('vitest').Mock).mockResolvedValue([]);

    const req = new NextRequest('http://localhost/api');
    const res = await POST(req, { params: Promise.resolve({ id: jobId }) });
    
    if(res.status !== 409) console.log(await res.json()); 
    expect(res.status).toBe(409);
  });

  it('safely matches revisions during reprocessing to avoid attaching them to wrong rows', async () => {
    (prisma.parchaJob.findUnique as import('vitest').Mock)
      .mockResolvedValueOnce({
        id: jobId,
        status: 'UPLOADED',
        uploaderId: 'user1',
        processingToken: null
      })
      .mockResolvedValueOnce({
        id: jobId,
        storageKey: 'fake.jpg',
        status: 'PROCESSING'
      });

    (prisma.parchaJob.updateMany as import('vitest').Mock)
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });

    // Mock existing rows with revisions
    (prisma.parchaJobRow.findMany as import('vitest').Mock).mockResolvedValue([
      { sortOrder: 0, ocrOriginalText: 'Old Item 1', revisedProductName: 'Corrected 1' },
      { sortOrder: 1, ocrOriginalText: 'Old Item 2', revisedProductName: 'Corrected 2' }
    ]);

    // Mock OCR returning different number of items and text
    (GeminiOcrProvider as import('vitest').Mock).mockImplementation(function() {
      return {
        getProviderName: () => 'google:gemini',
        getModelName: () => 'gemini-1.5-flash',
        extractFromImage: vi.fn().mockResolvedValue({ 
          rawText: 'text', 
          items: [
            { originalText: 'New Item 1', productName: 'OCR 1', normalizedProductName: 'Norm 1' },
            { originalText: 'Old Item 2', productName: 'OCR 2', normalizedProductName: 'Norm 2' }, // Exact match
            { originalText: 'New Item 3', productName: 'OCR 3', normalizedProductName: 'Norm 3' }
          ] 
        })
      };
    });

    const req = new NextRequest('http://localhost/api');
    const res = await POST(req, { params: Promise.resolve({ id: jobId }) });
    expect(res.status).toBe(200);

    const createManyCall = (prisma.parchaJobRow.createMany as import('vitest').Mock)?.mock?.calls?.[0]?.[0]?.data;
    
    // Item 1: length changed and original text differs -> loses revision
    expect(createManyCall[0].revisedProductName).toBe('OCR 1');
    
    // Item 2: original text matches exactly -> preserves revision
    expect(createManyCall[1].revisedProductName).toBe('Corrected 2');
    
    // Item 3: entirely new -> no revision
    if (createManyCall[2].revisedProductName !== 'OCR 3') console.log(createManyCall); expect(createManyCall[2].revisedProductName).toBe('OCR 3');
  });
  it('safely handles duplicate original text without applying the same correction multiple times', async () => {
    (prisma.parchaJob.findUnique as import('vitest').Mock)
      .mockResolvedValueOnce({
        id: jobId,
        status: 'UPLOADED',
        uploaderId: 'user1',
        processingToken: null
      })
      .mockResolvedValueOnce({
        id: jobId,
        storageKey: 'fake.jpg',
        status: 'PROCESSING'
      });

    (prisma.parchaJob.updateMany as import('vitest').Mock).mockResolvedValue({ count: 1 });

    (prisma.parchaJobRow.findMany as import('vitest').Mock).mockResolvedValue([
      { sortOrder: 0, ocrOriginalText: 'Duplicate', revisedProductName: 'Corrected 1' },
      { sortOrder: 1, ocrOriginalText: 'Duplicate', revisedProductName: 'Corrected 2' }
    ]);

    (GeminiOcrProvider as import('vitest').Mock).mockImplementation(function() {
      return {
        getProviderName: () => 'google:gemini',
        getModelName: () => 'gemini-1.5-flash',
        extractFromImage: vi.fn().mockResolvedValue({ 
          rawText: 'text', 
          items: [
            { originalText: 'Duplicate', productName: 'OCR 1', normalizedProductName: 'Norm 1' },
            { originalText: 'Duplicate', productName: 'OCR 2', normalizedProductName: 'Norm 2' },
            { originalText: 'Duplicate', productName: 'OCR 3', normalizedProductName: 'Norm 3' }
          ] 
        })
      };
    });

    const req = new NextRequest('http://localhost/api');
    await POST(req, { params: Promise.resolve({ id: jobId }) });

    const createManyCall = (prisma.parchaJobRow.createMany as import('vitest').Mock)?.mock?.calls?.[0]?.[0]?.data;
    
    // First two get the corrections (consumed in order of original array due to findIndex)
    expect(createManyCall[0].revisedProductName).toBe('Corrected 1');
    expect(createManyCall[1].revisedProductName).toBe('Corrected 2');
    
    // Third one has no available correction left to consume!
    expect(createManyCall[2].revisedProductName).toBe('OCR 3');
  });
});
