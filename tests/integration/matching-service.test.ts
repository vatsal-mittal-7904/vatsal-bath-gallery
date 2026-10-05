/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/lib/db/client';
import { MatchingService } from '../../src/features/parcha/matching.service';
import { CatalogueService } from '../../src/features/catalogue/catalogue.service';

const isTestDb = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('testdb');

describe.skipIf(!isTestDb)('Matching Service & API (Phase 6.3.2)', () => {
  let catId: string;
  let prod1Id: string;
  let prod2Id: string;

  beforeAll(async () => {
    await prisma.parchaJobRow.deleteMany();
    await prisma.parchaJob.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();

    const cat = await CatalogueService.createCategory({ name: 'Matching Cat', isActive: true });
    catId = cat.id;

    const prod1 = await CatalogueService.createProduct({
      name: 'Super Strong PVC Pipe',
      categoryId: cat.id,
      isActive: true,
      variants: [{ sku: 'PVC-01', sellingPrice: 100, isActive: true, attributes: { size: '1 inch' } }]
    });
    prod1Id = prod1.id;

    const prod2 = await CatalogueService.createProduct({
      name: 'Hindi नल',
      categoryId: cat.id,
      isActive: true,
      variants: [{ sku: 'NAL-01', sellingPrice: 50, isActive: true, attributes: {} }]
    });
    prod2Id = prod2.id;
  });

  afterAll(async () => {
    await prisma.parchaJobRow.deleteMany();
    await prisma.parchaJob.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
  });

  it('suggests exact match with high confidence', async () => {
    const row = {
      ocrOriginalText: 'pvc pipe 1 inch',
      ocrNormalizedProductName: 'Super Strong PVC Pipe',
    } as any;

    const result = await MatchingService.suggestCandidates(row);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.product.id).toBe(prod1Id);
    expect(result.candidates[0]!.confidence).toBe('high');
  });

  it('suggests medium confidence for partial match', async () => {
    const row = {
      ocrOriginalText: 'pvc pipe',
      ocrProductName: 'PVC Pipe',
    } as any;

    const result = await MatchingService.suggestCandidates(row);
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates[0]!.confidence).toBe('medium');
    expect(result.candidates[0]!.product.name).toBe('Super Strong PVC Pipe');
  });

  it('handles Hindi / Hinglish properly', async () => {
    const row = {
      ocrOriginalText: 'नल',
      ocrProductName: 'नल',
    } as any;

    const result = await MatchingService.suggestCandidates(row);
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates[0]!.product.name).toBe('Hindi नल');
  });

  it('returns no candidates for insufficient evidence', async () => {
    const row = {
      ocrOriginalText: '',
    } as any;

    const result = await MatchingService.suggestCandidates(row);
    expect(result.candidates).toHaveLength(0);
    expect(result.message).toContain('Insufficient');
  });

  it('returns no candidates for unknown words', async () => {
    const row = {
      ocrOriginalText: 'alien artifact',
      ocrProductName: 'alien artifact',
    } as any;

    const result = await MatchingService.suggestCandidates(row);
    expect(result.candidates).toHaveLength(0);
    expect(result.message).toContain('No catalogue products match');
  });
});
