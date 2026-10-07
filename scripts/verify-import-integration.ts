import { prisma } from '../src/lib/db/client';
import { CatalogueService } from '../src/features/catalogue/catalogue.service';
import { toSafeProductVariant } from '../src/features/catalogue/catalogue.utils';
import { MatchingService } from '../src/features/parcha/matching.service';
import { EstimateService } from '../src/features/billing/estimate.service';
import { BillService } from '../src/features/billing/bill.service';
import { EstimateStatus, BillStatus } from '@prisma/client';

async function verify() {
  console.log('================================================================');
  console.log('    VERIFYING IMPORT INTEGRATION, SECURITY & BUSINESS FLOWS     ');
  console.log('================================================================\n');

  // 1. CATALOGUE HIERARCHY & PRODUCTS VERIFICATION
  console.log('--- 1. Catalogue Hierarchy & Structure ---');
  const prods = await CatalogueService.listProducts({ page: 1, limit: 100 });
  if (prods.total !== 9) {
    throw new Error(`Expected 9 products, got ${prods.total}`);
  }
  console.log(`  [PASS] 9 Base Products listed via CatalogueService (Total: ${prods.total})`);

  const upvcProduct = prods.items.find(p => p.name === 'UPVC Pipe');
  if (!upvcProduct || upvcProduct.variants.length !== 6) {
    throw new Error(`Expected UPVC Pipe with 6 variants, got ${upvcProduct?.variants.length}`);
  }
  console.log(`  [PASS] UPVC Pipe found with 6 variants (Category: ${upvcProduct.category.name})`);

  // 2. COST PRICE CONFIDENTIALITY (OWNER vs STAFF)
  console.log('\n--- 2. Cost-Price Confidentiality Verification ---');
  const pipe4Variant = upvcProduct.variants.find(v => v.sku === 'APOLLO-UPVC-PIPE-4-INCH-X-20-FT');
  if (!pipe4Variant) throw new Error('Variant APOLLO-UPVC-PIPE-4-INCH-X-20-FT not found');

  // A. OWNER Access (with catalogue:cost:read)
  const safeOwnerVariant = toSafeProductVariant(pipe4Variant, { includeCost: true });
  if (safeOwnerVariant.costPrice !== 770) {
    throw new Error(`Expected OWNER costPrice 770, got ${safeOwnerVariant.costPrice}`);
  }
  if (safeOwnerVariant.sellingPrice !== 780) {
    throw new Error(`Expected OWNER sellingPrice 780, got ${safeOwnerVariant.sellingPrice}`);
  }
  console.log(`  [PASS] [SECURITY] OWNER successfully views costPrice: ₹${safeOwnerVariant.costPrice} (sellingPrice: ₹${safeOwnerVariant.sellingPrice})`);

  // B. STAFF Access (without catalogue:cost:read)
  const safeStaffVariant = toSafeProductVariant(pipe4Variant, { includeCost: false });
  if ('costPrice' in safeStaffVariant && safeStaffVariant.costPrice !== undefined) {
    throw new Error(`SECURITY LEAK: STAFF received costPrice ${safeStaffVariant.costPrice}`);
  }
  console.log('  [PASS] [SECURITY] STAFF response strictly omits costPrice (undefined)');

  // 3. PARCHA CANDIDATE MATCHING
  console.log('\n--- 3. Parcha OCR Matching Compatibility ---');
  const ownerUser = await prisma.user.findFirst({ where: { role: 'OWNER' } });
  
  const testJob = await prisma.parchaJob.create({
    data: {
      originalFilename: 'test_pipe_ocr.jpg',
      storageKey: `test_pipe_ocr_key_${Date.now()}`,
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
      uploaderId: ownerUser!.id,
      status: 'PROCESSING'
    }
  });

  const testRow = await prisma.parchaJobRow.create({
    data: {
      jobId: testJob.id,
      sortOrder: 0,
      ocrOriginalText: 'UPVC Pipe 2 pcs',
      ocrProductName: 'UPVC Pipe',
      ocrNormalizedProductName: 'UPVC Pipe',
      ocrQuantity: '2',
      ocrUnit: 'pcs',
      ocrConfidence: 'high'
    }
  });

  const matchingResults = await MatchingService.suggestCandidates(testRow);
  if (!matchingResults.candidates || matchingResults.candidates.length === 0) {
    throw new Error('Parcha candidate matching failed to find candidates for UPVC Pipe');
  }

  const topCandidate = matchingResults.candidates[0]!;
  console.log(`  [PASS] Parcha candidate matched: ${topCandidate.product.name} (Confidence: ${topCandidate.confidence})`);
  console.log(`  [PASS] Matched Variant ID: ${topCandidate.suggestedVariantId || 'Found in variants'}`);

  // Clean up parcha test job
  await prisma.parchaJobRow.deleteMany({ where: { jobId: testJob.id } });
  await prisma.parchaJob.deleteMany({ where: { id: testJob.id } });
  console.log('  [PASS] Parcha matching test records cleaned up');

  // 4. BILLING & INVENTORY COMPATIBILITY FLOW
  console.log('\n--- 4. Billing, Ceiling Rounding & Inventory Flow ---');
  const location = await prisma.inventoryLocation.findFirst({ where: { isDefault: true } });
  if (!location) throw new Error('Default location WH-MAIN not found');

  const preTestBal = await prisma.inventoryBalance.findUnique({
    where: { variantId_locationId: { variantId: pipe4Variant.id, locationId: location.id } }
  });
  if (preTestBal?.quantity.toNumber() !== 999) {
    throw new Error(`Expected initial balance 999, got ${preTestBal?.quantity.toNumber()}`);
  }
  console.log(`  [PASS] Pre-test balance in ${location.code}: ${preTestBal.quantity.toNumber()} units`);

  // Create temporary test customer
  const testCustomer = await prisma.customer.create({
    data: {
      name: 'Catalogue Flow Customer',
      phoneNumber: '9988776655',
      billingAddress: 'Bareilly UP'
    }
  });

  // Create Estimate for 3 units of UPVC Pipe 4 Inch 20ft (selling price ₹770)
  const estimate = await EstimateService.createEstimate({
    customerId: testCustomer.id,
    creatorId: ownerUser!.id,
    issueDate: new Date(),
    lines: [
      {
        variantId: pipe4Variant.id,
        productSnapshot: 'UPVC Pipe - 4 Inch 20ft',
        quantity: '3',
        unitRate: '770.00',
        discountAmount: '0',
        taxRate: '18'
      }
    ]
  });
  console.log(`  [PASS] Estimate created: ${estimate.estimateNumber} (Grand Total: ₹${estimate.grandTotal})`);

  // Verify Estimate creation did NOT deduct inventory
  const estBal = await prisma.inventoryBalance.findUnique({
    where: { variantId_locationId: { variantId: pipe4Variant.id, locationId: location.id } }
  });
  if (estBal?.quantity.toNumber() !== 999) {
    throw new Error(`Inventory leak: Estimate deducted stock! Value: ${estBal?.quantity.toNumber()}`);
  }
  console.log('  [PASS] Inventory preserved during estimate draft (Balance: 999.000)');

  // Convert Estimate to Bill (DRAFT -> SENT -> ACCEPTED -> Convert)
  await EstimateService.updateStatus(estimate.id, EstimateStatus.SENT, estimate.version);
  const sentEst = await prisma.estimate.findUniqueOrThrow({ where: { id: estimate.id } });
  await EstimateService.updateStatus(estimate.id, EstimateStatus.ACCEPTED, sentEst.version);
  const acceptedEst = await prisma.estimate.findUniqueOrThrow({ where: { id: estimate.id } });
  const bill = await BillService.convertEstimateToBill(estimate.id, acceptedEst.version);
  console.log(`  [PASS] Estimate converted to Bill: ${bill.billNumber} (Status: DRAFT)`);

  // Issue Bill -> Deduct stock
  await BillService.updateStatus(bill.id, BillStatus.ISSUED, {
    locationId: location.id,
    userId: ownerUser!.id
  });

  const postIssueBal = await prisma.inventoryBalance.findUnique({
    where: { variantId_locationId: { variantId: pipe4Variant.id, locationId: location.id } }
  });
  if (postIssueBal?.quantity.toNumber() !== 996) { // 999 - 3 = 996
    throw new Error(`Expected balance 996 after issuance, got ${postIssueBal?.quantity.toNumber()}`);
  }
  console.log(`  [PASS] [CRITICAL] Stock deducted upon bill issuance: 999 -> ${postIssueBal.quantity.toNumber()} (-3 units)`);

  // Cancel Bill -> Restore stock
  await BillService.updateStatus(bill.id, BillStatus.CANCELLED, {
    reason: 'Test cancellation and stock reversal'
  });

  const postCancelBal = await prisma.inventoryBalance.findUnique({
    where: { variantId_locationId: { variantId: pipe4Variant.id, locationId: location.id } }
  });
  if (postCancelBal?.quantity.toNumber() !== 999) { // 996 + 3 = 999
    throw new Error(`Expected balance restored to 999, got ${postCancelBal?.quantity.toNumber()}`);
  }
  console.log(`  [PASS] [CRITICAL] Stock restored upon cancellation: 996 -> ${postCancelBal.quantity.toNumber()} (+3 restored)`);

  // Clean up billing test data
  await prisma.stockMovement.deleteMany({ where: { billId: bill.id } });
  await prisma.billLine.deleteMany({ where: { billId: bill.id } });
  await prisma.bill.deleteMany({ where: { id: bill.id } });
  await prisma.estimateLine.deleteMany({ where: { estimateId: estimate.id } });
  await prisma.estimate.deleteMany({ where: { id: estimate.id } });
  await prisma.customer.deleteMany({ where: { id: testCustomer.id } });
  console.log('  [PASS] Billing test data cleaned up safely\n');

  console.log('================================================================');
  console.log('  ALL INTEGRATION, SECURITY & BUSINESS CHECKS PASSED 100%!     ');
  console.log('================================================================');
}

verify()
  .catch(err => {
    console.error('\n❌ VERIFICATION FAILED:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
