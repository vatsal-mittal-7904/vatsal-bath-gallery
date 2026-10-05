/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { prisma } from '@/lib/db/client';
import { POST } from '@/app/api/v1/parcha-jobs/[id]/process/route';
import { NextRequest } from 'next/server';
import { GeminiOcrProvider } from '@/features/parcha/providers/gemini-ocr.provider';
import { requirePermission } from '@/features/auth/auth.guard';
import { getFile } from '@/lib/storage';

// Mock auth and storage to focus on Database Concurrency logic
vi.mock('@/features/auth/auth.guard', () => ({
  requirePermission: vi.fn()
}));

vi.mock('@/lib/storage', () => ({
  getFile: vi.fn().mockResolvedValue({ buffer: Buffer.from('fake'), mimeType: 'image/png' })
}));

describe('PostgreSQL Concurrency Integration', () => {
  let user: import('@prisma/client').User;

  beforeAll(async () => {
    // Create a user in the real test database
    user = await prisma.user.create({
      data: {
        email: `test-${Date.now()}@test.com`,
        passwordHash: 'dummy',
        role: 'OWNER',
        name: 'Test User'
      }
    });
  });

  afterAll(async () => {
    await prisma.parchaJobRow.deleteMany();
    await prisma.parchaJob.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    (requirePermission as import('vitest').Mock).mockResolvedValue(user);
  });

  it('atomically ensures only one concurrent request acquires the claim', async () => {
    // Create an uploaded job
    const job = await prisma.parchaJob.create({
      data: {
        uploaderId: user.id,
        storageKey: 'test-concurrency.jpg',
        status: 'UPLOADED', originalFilename: 'test.jpg', mimeType: 'image/jpeg', sizeBytes: 100,
        processingAttempts: 0
      }
    });

    // Mock OCR to just return basic data
    const mockExtract = vi.spyOn(GeminiOcrProvider.prototype, 'extractFromImage')
      .mockResolvedValue({ rawText: 'text', items: [] });

    // Fire two requests concurrently
    const req1 = new NextRequest('http://localhost/api');
    const req2 = new NextRequest('http://localhost/api');

    const [res1, res2] = await Promise.all([
      POST(req1, { params: Promise.resolve({ id: job.id }) }),
      POST(req2, { params: Promise.resolve({ id: job.id }) })
    ]);

    // Exactly one should succeed (200), one should fail (409 Conflict)
    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 409]);

    // Job should be marked REVIEW_REQUIRED with exactly 1 attempt
    const updatedJob = await prisma.parchaJob.findUnique({ where: { id: job.id } });
    expect(updatedJob?.status).toBe('REVIEW_REQUIRED');
    expect(updatedJob?.processingAttempts).toBe(1);
    
    mockExtract.mockRestore();
  });

  it('rejects stale writes when a job is reclaimed and prevents mutation of new state', async () => {
    const job = await prisma.parchaJob.create({
      data: {
        uploaderId: user.id,
        storageKey: 'test-stale.jpg',
        status: 'UPLOADED', originalFilename: 'test.jpg', mimeType: 'image/jpeg', sizeBytes: 100
      }
    });

    // We will simulate a STALLED request that hangs during OCR
    let resolveHangingOcr: (val: any) => void;
    const hangingOcrPromise = new Promise(resolve => { resolveHangingOcr = resolve; });
    
    const mockExtract1 = vi.fn().mockImplementation(() => hangingOcrPromise);
    const mockExtract2 = vi.fn().mockResolvedValue({ rawText: 'new text', items: [] });

    const providerSpy = vi.spyOn(GeminiOcrProvider.prototype, 'extractFromImage');

    providerSpy.mockImplementationOnce(mockExtract1);

    const req1 = new NextRequest('http://localhost/api');
    const p1 = POST(req1, { params: Promise.resolve({ id: job.id }) });

    // Wait slightly to let req1 claim the job and enter OCR
    await new Promise(r => setTimeout(r, 100));

    // Manually push the job to simulate a stall (>5 mins old)
    await prisma.parchaJob.update({
      where: { id: job.id },
      data: { processingStartedAt: new Date(Date.now() - 6 * 60 * 1000) }
    });

    // Fire req2 which will reclaim the stalled job
    providerSpy.mockImplementationOnce(mockExtract2);
    const req2 = new NextRequest('http://localhost/api');
    const res2 = await POST(req2, { params: Promise.resolve({ id: job.id }) });
    expect(res2.status).toBe(200);

    // Now req2 finished. The DB has new text and REVIEW_REQUIRED.
    // Unblock req1! It will now attempt to write its stale results.
    resolveHangingOcr!({ rawText: 'stale text', items: [] });
    const res1 = await p1;

    // req1 must safely yield 409 because its claim token is stale
    expect(res1.status).toBe(409);

    // Verify DB integrity (req2's data was not overwritten)
    const finalJob = await prisma.parchaJob.findUnique({ where: { id: job.id } });
    expect(finalJob?.status).toBe('REVIEW_REQUIRED');
    expect(finalJob?.rawOcrText).toBe('new text'); // Not 'stale text'!
    
    providerSpy.mockRestore();
  });

  it('preserves corrections across reprocessing and maps them correctly', async () => {
    const job = await prisma.parchaJob.create({
      data: {
        uploaderId: user.id,
        storageKey: 'test-reprocess.jpg',
        status: 'UPLOADED', originalFilename: 'test.jpg', mimeType: 'image/jpeg', sizeBytes: 100
      }
    });

    // Pre-seed an existing row with a user correction
    await prisma.parchaJobRow.create({
      data: {
        jobId: job.id,
        sortOrder: 0,
        ocrOriginalText: 'Old Item',
        ocrProductName: 'Bad OCR Name',
        revisedProductName: 'Human Corrected Name', // This is the correction!
        ocrQuantity: '1'
      }
    });

    // Mock OCR producing the same original text, plus a new item
    const mockExtract = vi.spyOn(GeminiOcrProvider.prototype, 'extractFromImage')
      .mockResolvedValue({ 
        rawText: 'text', 
        items: [
          { originalText: 'Old Item', productName: 'Bad OCR Name 2', normalizedProductName: 'Norm OCR 2', quantity: '1', brand: null, size: null, unit: null, description: null, confidence: 'high', notes: null },
          { originalText: 'New Item', productName: 'New OCR Name', normalizedProductName: 'Norm OCR 3', quantity: '2', brand: null, size: null, unit: null, description: null, confidence: 'high', notes: null }
        ] 
      });

    const req = new NextRequest('http://localhost/api');
    const res = await POST(req, { params: Promise.resolve({ id: job.id }) });
    expect(res.status).toBe(200);

    // Check rows in DB
    const rows = await prisma.parchaJobRow.findMany({ where: { jobId: job.id }, orderBy: { sortOrder: 'asc' } });
    
    expect(rows).toHaveLength(2);
    // The human correction must survive on the matched row
    expect(rows[0]!.revisedProductName).toBe('Human Corrected Name');
    // The new row should not have a correction transferred improperly
    expect(rows[1]!.revisedProductName).toBe('New OCR Name');

    mockExtract.mockRestore();
  });
});
