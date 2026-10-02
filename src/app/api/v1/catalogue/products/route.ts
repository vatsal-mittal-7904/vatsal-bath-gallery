import { NextRequest } from 'next/server';
import { withApiWrapper, successResponse } from '@/lib/api-wrapper';
import { requirePermission } from '@/features/auth/auth.guard';
import { CatalogueService } from '@/features/catalogue/catalogue.service';
import { productSchema, productFilterSchema } from '@/features/catalogue/catalogue.validation';
import { toSafeProduct } from '@/features/catalogue/catalogue.utils';

export const GET = withApiWrapper(async (req: NextRequest) => {
  await requirePermission('catalogue:read');
  const url = new URL(req.url);
  const query = Object.fromEntries(url.searchParams);
  const params = productFilterSchema.parse(query);
  const result = await CatalogueService.listProducts(params);
  return successResponse({ ...result, items: result.items.map(toSafeProduct) }, 'Products retrieved', 200, req);
});

export const POST = withApiWrapper(async (req: NextRequest) => {
  await requirePermission('catalogue:create');
  const body = await req.json();
  const data = productSchema.parse(body);
  const result = await CatalogueService.createProduct(data);
  return successResponse({ product: toSafeProduct(result) }, 'Product created', 201, req);
});