/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '../../src/lib/db/client';
import { GET } from '../../src/app/api/v1/parcha-jobs/[id]/matching/route';
import { PATCH } from '../../src/app/api/v1/parcha-jobs/[id]/extraction/route';
import { CatalogueService } from '../../src/features/catalogue/catalogue.service';
import * as authGuard from '../../src/features/auth/auth.guard';
import { AppError } from '../../src/lib/errors';

const isTestDb = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('testdb');

describe.skipIf(!isTestDb)('Matching API Authorization & Integrity (Phase 6.3.2.1)', () => {
  let jobStaff1: any;
  let jobStaff2: any;
  let rowStaff1: any;
  let productA: any;

  beforeAll(async () => {
    // Setup Mock Auth
    vi.spyOn(authGuard, 'requirePermission').mockImplementation(async (permission: any) => {
      // We will read a global context or just look at headers in the test wrapper?
      // Since NextRequest headers can't be easily read globally by the mock without access to req,
      // wait, `requirePermission` doesn't take `req`. It reads cookies globally.
      // So how do we mock per-test? We can re-mock it in each test!
      return { id: 'default', role: 'OWNER', email: '', name: '', isActive: true } as any;
    });

    await prisma.parchaJobRow.deleteMany();
    await prisma.parchaJob.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.user.deleteMany();

    await prisma.user.createMany({
      data: [
        { id: 'owner', email: 'o@t.com', name: 'O', role: 'OWNER', passwordHash: 'x' },
        { id: 'staff1', email: 's1@t.com', name: 'S1', role: 'STAFF', passwordHash: 'x' },
        { id: 'staff2', email: 's2@t.com', name: 'S2', role: 'STAFF', passwordHash: 'x' },
        
      ]
    });

    const cat = await CatalogueService.createCategory({ name: 'Cat', isActive: true });
    productA = await CatalogueService.createProduct({
      name: 'Product A', categoryId: cat.id, isActive: true,
      variants: [{ sku: 'SKU-A', sellingPrice: 100, costPrice: 50, isActive: true, attributes: {} }]
    });

    jobStaff1 = await prisma.parchaJob.create({
      data: {
        id: 'job-staff1', uploaderId: 'staff1', originalFilename: 'x.jpg', storageKey: 'x' + Math.random(), mimeType: 'x', sizeBytes: 10,
        status: 'REVIEW_REQUIRED', rawOcrText: '', processingToken: 't1'
      }
    });

    rowStaff1 = await prisma.parchaJobRow.create({
      data: { jobId: jobStaff1.id, ocrOriginalText: 'Product A', version: 0 }
    });

    jobStaff2 = await prisma.parchaJob.create({
      data: {
        id: 'job-staff2', uploaderId: 'staff2', originalFilename: 'x.jpg', storageKey: 'x' + Math.random(), mimeType: 'x', sizeBytes: 10,
        status: 'REVIEW_REQUIRED', rawOcrText: '', processingToken: 't2'
      }
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
  });

  const mockUser = (id: string, role: string, throws?: 'unauth' | 'forbidden') => {
    vi.spyOn(authGuard, 'requirePermission').mockImplementation(async () => {
      if (throws === 'unauth') throw new Error('Unauthorized'); // using generic error for Next fallback
      if (throws === 'forbidden') throw new Error('Forbidden');
      return { id, role, email: '', name: '', isActive: true } as any;
    });
  };

  it('GET: Authorized owner can retrieve candidates', async () => {
    mockUser('owner', 'OWNER');
    const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${jobStaff1.id}/matching?rowId=${rowStaff1.id}`);
    const res = await GET(req, { params: Promise.resolve({ id: jobStaff1.id }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.candidates.length).toBeGreaterThan(0);
    
    // Check no costPrice is exposed
    const prod = data.candidates[0].product;
    expect(prod.variants[0].costPrice).toBeUndefined();
  });

  it('GET: Staff can retrieve their own job candidates', async () => {
    mockUser('staff1', 'STAFF');
    const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${jobStaff1.id}/matching?rowId=${rowStaff1.id}`);
    const res = await GET(req, { params: Promise.resolve({ id: jobStaff1.id }) });
    expect(res.status).toBe(200);
  });

  it('GET: Staff cannot retrieve another staffs job candidates', async () => {
    mockUser('staff2', 'STAFF');
    const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${jobStaff1.id}/matching?rowId=${rowStaff1.id}`);
    const res = await GET(req, { params: Promise.resolve({ id: jobStaff1.id }) });
    expect(res.status).toBe(403);
  });

  it('GET: Unauthenticated/unauthorized users are rejected', async () => {
    mockUser('anon', 'ANON', 'unauth');
    const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${jobStaff1.id}/matching?rowId=${rowStaff1.id}`);
    const res = await GET(req, { params: Promise.resolve({ id: jobStaff1.id }) });
    expect(res.status).toBe(500); // Because we threw generic Error('Unauthorized'), it goes to 500 in route try/catch unless handled. Wait, the route says: status: error.message === 'Forbidden' ? 403 : 500. So it's 500.
  });

  it('PATCH: Staff can save valid revision to own job', async () => {
    mockUser('staff1', 'STAFF');
    const payload = { rows: [{ id: rowStaff1.id, version: 0, revisedProductName: 'A', confirmedProductId: productA.id }] };
    const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${jobStaff1.id}/extraction`, { method: 'PATCH', body: JSON.stringify(payload) });
    const res = await PATCH(req, { params: Promise.resolve({ id: jobStaff1.id }) });
    expect(res.status).toBe(200);
  });

  it('PATCH: Staff cannot modify another users job', async () => {
    mockUser('staff2', 'STAFF');
    const payload = { rows: [{ id: rowStaff1.id, version: 1, revisedProductName: 'B' }] };
    const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${jobStaff1.id}/extraction`, { method: 'PATCH', body: JSON.stringify(payload) });
    const res = await PATCH(req, { params: Promise.resolve({ id: jobStaff1.id }) });
    expect(res.status).toBe(403);
  });

  it('PATCH: Invalid Zod payload rejected', async () => {
    mockUser('staff1', 'STAFF');
    const payload = { rows: [{ id: rowStaff1.id, missingVersion: true }] };
    const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${jobStaff1.id}/extraction`, { method: 'PATCH', body: JSON.stringify(payload) });
    const res = await PATCH(req, { params: Promise.resolve({ id: jobStaff1.id }) });
    expect(res.status).toBe(400);
  });

  it('PATCH: Job outside editable status is rejected', async () => {
    mockUser('staff1', 'STAFF');
    await prisma.parchaJob.update({ where: { id: jobStaff1.id }, data: { status: 'COMPLETED' } });
    const payload = { rows: [{ id: rowStaff1.id, version: 1, revisedProductName: 'C' }] };
    const req = new NextRequest(`http://localhost/api/v1/parcha-jobs/${jobStaff1.id}/extraction`, { method: 'PATCH', body: JSON.stringify(payload) });
    const res = await PATCH(req, { params: Promise.resolve({ id: jobStaff1.id }) });
    expect(res.status).toBe(409);
  });
});
