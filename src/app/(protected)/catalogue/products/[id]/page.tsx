/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps */
'use client';
import { useEffect, useState, use } from 'react';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { fetchApi } from '@/lib/api-client';
import { SafeProduct, SafeProductVariant, SafeCategory, SafeBrand } from '@/features/catalogue/catalogue.types';
import { useAuth } from '@/components/auth/AuthProvider';
import { hasPermission } from '@/features/auth/permissions';
import { useRouter } from 'next/navigation';

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  
  const [product, setProduct] = useState<SafeProduct | null>(null);
  const [variants, setVariants] = useState<SafeProductVariant[]>([]);
  const [categories, setCategories] = useState<SafeCategory[]>([]);
  const [brands, setBrands] = useState<SafeBrand[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Variant Form State
  const [isVariantFormOpen, setIsVariantFormOpen] = useState(false);
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [variantForm, setVariantForm] = useState({ sku: '', barcode: '', sellingPrice: '', isActive: true });
  const [submittingVariant, setSubmittingVariant] = useState(false);

  const { user } = useAuth();
  const canWrite = user ? hasPermission(user.role, 'catalogue:update') : false;
  const canArchive = user ? hasPermission(user.role, 'catalogue:archive') : false;

  const loadData = async () => {
    setLoading(true);
    try {
      const [prodRes, varRes, catRes, brandRes] = await Promise.all([
        fetchApi<{ product: SafeProduct }>(`/catalogue/products/${id}`),
        fetchApi<{ items: SafeProductVariant[] }>(`/catalogue/products/${id}/variants`),
        fetchApi<{ items: SafeCategory[] }>('/catalogue/categories?limit=500&isActive=true'),
        fetchApi<{ items: SafeBrand[] }>('/catalogue/brands?limit=100&isActive=true'),
      ]);
      setProduct(prodRes.product);
      setVariants(varRes.items);
      setCategories(catRes.items);
      setBrands(brandRes.items);
    } catch (err: any) {
      setError(err.message || 'Failed to load product details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
   
  }, [id]);

  const handleProductArchive = async () => {
    if (!product || !confirm(`Archive product "${product.name}"? This will also archive all variants.`)) return;
    try {
      await fetchApi(`/catalogue/products/${id}/archive`, { method: 'POST' });
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to archive product');
    }
  };

  const handleVariantArchive = async (variantId: string, sku: string) => {
    if (!confirm(`Archive variant "${sku}"?`)) return;
    try {
      await fetchApi(`/catalogue/variants/${variantId}/archive`, { method: 'POST' });
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to archive variant');
    }
  };

  const openVariantForm = (v?: SafeProductVariant) => {
    if (v) {
      setEditingVariantId(v.id);
      setVariantForm({ sku: v.sku, barcode: v.barcode || '', sellingPrice: v.sellingPrice.toString(), isActive: v.isActive });
    } else {
      setEditingVariantId(null);
      setVariantForm({ sku: '', barcode: '', sellingPrice: '', isActive: true });
    }
    setIsVariantFormOpen(true);
    setError('');
  };

  const submitVariant = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingVariant(true);
    setError('');
    const payload = {
      sku: variantForm.sku,
      barcode: variantForm.barcode || null,
      sellingPrice: parseFloat(variantForm.sellingPrice),
      isActive: variantForm.isActive,
    };

    try {
      if (editingVariantId) {
        await fetchApi(`/catalogue/variants/${editingVariantId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await fetchApi(`/catalogue/products/${id}/variants`, { method: 'POST', body: JSON.stringify(payload) });
      }
      setIsVariantFormOpen(false);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to save variant');
    } finally {
      setSubmittingVariant(false);
    }
  };

  if (loading) return <div className="flex justify-center p-12"><Spinner /></div>;
  if (!product) return <div className="p-6 text-red-600">Product not found.</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Button variant="secondary" onClick={() => router.push('/catalogue/products')}>&larr; Back</Button>
          <h2 className="text-2xl font-bold text-gray-900">{product.name}</h2>
          {!product.isActive && <span className="bg-gray-200 text-gray-700 px-2 py-1 rounded text-xs font-semibold">Archived</span>}
        </div>
        {canArchive && product.isActive && (
          <Button variant="secondary" onClick={handleProductArchive}>Archive Product</Button>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-md border border-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <Card className="p-6">
            <h3 className="text-lg font-bold mb-4">Product Details</h3>
            <div className="space-y-4">
              <div>
                <span className="block text-xs font-semibold text-gray-500 uppercase">Category</span>
                <span className="text-sm text-gray-900">{product.category?.name || '-'}</span>
              </div>
              <div>
                <span className="block text-xs font-semibold text-gray-500 uppercase">Brand</span>
                <span className="text-sm text-gray-900">{product.brand?.name || '-'}</span>
              </div>
              <div>
                <span className="block text-xs font-semibold text-gray-500 uppercase">Description</span>
                <span className="text-sm text-gray-900 whitespace-pre-wrap">{product.description || '-'}</span>
              </div>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Variants</h3>
              {canWrite && !isVariantFormOpen && product.isActive && (
                <Button onClick={() => openVariantForm()}>Add Variant</Button>
              )}
            </div>

            {isVariantFormOpen ? (
              <form onSubmit={submitVariant} className="space-y-4 bg-gray-50 p-4 rounded-md border mb-6">
                <h4 className="font-semibold text-gray-800">{editingVariantId ? 'Edit Variant' : 'New Variant'}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
                    <Input required value={variantForm.sku} onChange={(e) => setVariantForm(prev => ({...prev, sku: e.target.value}))} disabled={submittingVariant} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Selling Price</label>
                    <Input required type="number" step="0.01" min="0" value={variantForm.sellingPrice} onChange={(e) => setVariantForm(prev => ({...prev, sellingPrice: e.target.value}))} disabled={submittingVariant} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Barcode (Optional)</label>
                    <Input value={variantForm.barcode} onChange={(e) => setVariantForm(prev => ({...prev, barcode: e.target.value}))} disabled={submittingVariant} />
                  </div>
                  {editingVariantId && (
                    <div className="flex items-center gap-2 mt-6">
                      <input type="checkbox" id="vActive" checked={variantForm.isActive} onChange={(e) => setVariantForm(prev => ({...prev, isActive: e.target.checked}))} disabled={submittingVariant} />
                      <label htmlFor="vActive" className="text-sm font-medium text-gray-700">Active</label>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={submittingVariant}>{submittingVariant ? 'Saving...' : 'Save'}</Button>
                  <Button type="button" variant="secondary" onClick={() => setIsVariantFormOpen(false)} disabled={submittingVariant}>Cancel</Button>
                </div>
              </form>
            ) : null}

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {variants.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-4 text-center text-gray-500">No variants.</td></tr>
                  ) : variants.map(v => (
                    <tr key={v.id}>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{v.sku}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{v.sellingPrice.toFixed(2)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {v.isActive ? <span className="text-green-600 bg-green-50 px-2 py-1 rounded text-[10px]">Active</span> : <span className="text-gray-500 bg-gray-50 px-2 py-1 rounded text-[10px]">Archived</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right space-x-2">
                        {canWrite && <Button variant="secondary" onClick={() => openVariantForm(v)}>Edit</Button>}
                        {canArchive && v.isActive && <Button variant="secondary" onClick={() => handleVariantArchive(v.id, v.sku)}>Archive</Button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
