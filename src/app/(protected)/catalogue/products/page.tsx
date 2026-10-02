/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps */
'use client';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { fetchApi } from '@/lib/api-client';
import { SafeProduct, SafeCategory, SafeBrand } from '@/features/catalogue/catalogue.types';
import { useAuth } from '@/components/auth/AuthProvider';
import { hasPermission } from '@/features/auth/permissions';
import { useRouter } from 'next/navigation';

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<SafeProduct[]>([]);
  const [categories, setCategories] = useState<SafeCategory[]>([]);
  const [brands, setBrands] = useState<SafeBrand[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Search state
  const [searchTerm, setSearchTerm] = useState('');

  // Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    categoryId: '',
    brandId: '',
    initialSku: '',
    initialPrice: ''
  });

  const { user } = useAuth();
  const canWrite = user ? hasPermission(user.role, 'catalogue:create') : false;

  const loadData = async (search = '') => {
    setLoading(true);
    try {
      const [prodRes, catRes, brandRes] = await Promise.all([
        fetchApi<{ items: SafeProduct[] }>(`/catalogue/products?limit=50${search ? `&search=${encodeURIComponent(search)}` : ''}`),
        fetchApi<{ items: SafeCategory[] }>('/catalogue/categories?limit=500&isActive=true'),
        fetchApi<{ items: SafeBrand[] }>('/catalogue/brands?limit=100&isActive=true'),
      ]);
      setProducts(prodRes.items);
      setCategories(catRes.items);
      setBrands(brandRes.items);
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadData(searchTerm);
  };

  const openForm = () => {
    setFormData({
      name: '', description: '', categoryId: '', brandId: '', initialSku: '', initialPrice: ''
    });
    setIsFormOpen(true);
    setError('');
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    
    const payload = {
      name: formData.name,
      description: formData.description || null,
      categoryId: formData.categoryId,
      brandId: formData.brandId || null,
      isActive: true,
      variants: [
        {
          sku: formData.initialSku,
          sellingPrice: parseFloat(formData.initialPrice),
          isActive: true
        }
      ]
    };

    try {
      const res = await fetchApi<{ product: SafeProduct }>('/catalogue/products', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      closeForm();
      router.push(`/catalogue/products/${res.product.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create product');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-900">Products</h2>
        
        {!isFormOpen && (
          <form onSubmit={handleSearch} className="flex gap-2 w-full sm:w-auto">
            <Input 
              placeholder="Search products..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-xs"
            />
            <Button type="submit" variant="secondary">Search</Button>
            {canWrite && <Button type="button" onClick={() => openForm()}>Add Product</Button>}
          </form>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-md border border-red-200">
          {error}
        </div>
      )}

      {isFormOpen ? (
        <Card className="p-6 max-w-2xl">
          <h3 className="text-lg font-bold mb-4">New Product</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Product Name</label>
                <Input required value={formData.name} onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))} disabled={submitting} />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select required className="w-full px-3 py-2 border border-gray-300 rounded-md" value={formData.categoryId} onChange={(e) => setFormData(prev => ({ ...prev, categoryId: e.target.value }))} disabled={submitting}>
                  <option value="">-- Select Category --</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Brand (Optional)</label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-md" value={formData.brandId} onChange={(e) => setFormData(prev => ({ ...prev, brandId: e.target.value }))} disabled={submitting}>
                  <option value="">-- No Brand --</option>
                  {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>

              <div className="md:col-span-2 border-t pt-4 mt-2">
                <h4 className="text-sm font-semibold text-gray-800 mb-2">Initial Variant Setup</h4>
                <p className="text-xs text-gray-500 mb-4">Every product needs at least one variant to be sold.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Initial SKU</label>
                <Input required value={formData.initialSku} onChange={(e) => setFormData(prev => ({ ...prev, initialSku: e.target.value }))} disabled={submitting} placeholder="e.g. PRD-001" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Selling Price</label>
                <Input required type="number" step="0.01" min="0" value={formData.initialPrice} onChange={(e) => setFormData(prev => ({ ...prev, initialPrice: e.target.value }))} disabled={submitting} placeholder="0.00" />
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="submit" disabled={submitting}>{submitting ? 'Creating...' : 'Create Product'}</Button>
              <Button type="button" variant="secondary" onClick={closeForm} disabled={submitting}>Cancel</Button>
            </div>
          </form>
        </Card>
      ) : loading ? (
        <div className="flex justify-center p-12"><Spinner /></div>
      ) : (
        <Card className="overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Brand</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {products.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-4 text-center text-gray-500">No products found.</td></tr>
              ) : products.map(prod => (
                <tr key={prod.id}>
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{prod.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{prod.category?.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{prod.brand?.name || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {prod.isActive ? 
                      <span className="text-green-600 bg-green-50 px-2 py-1 rounded text-xs">Active</span> : 
                      <span className="text-gray-500 bg-gray-50 px-2 py-1 rounded text-xs">Archived</span>
                    }
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                    <Button variant="secondary" onClick={() => router.push(`/catalogue/products/${prod.id}`)}>Manage</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
