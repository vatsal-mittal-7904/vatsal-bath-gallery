/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps */
'use client';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { fetchApi } from '@/lib/api-client';
import { SafeBrand } from '@/features/catalogue/catalogue.types';
import { useAuth } from '@/components/auth/AuthProvider';
import { hasPermission } from '@/features/auth/permissions';

export default function BrandsPage() {
  const [brands, setBrands] = useState<SafeBrand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', isActive: true });
  const [submitting, setSubmitting] = useState(false);

  const { state: authState, user } = useAuth();
  const canWrite = user ? hasPermission(user.role, 'catalogue:create') : false;
  const canArchive = user ? hasPermission(user.role, 'catalogue:archive') : false;

  const loadBrands = async () => {
    setLoading(true);
    try {
      const res = await fetchApi<{ items: SafeBrand[] }>('/catalogue/brands?limit=100');
      setBrands(res.items);
    } catch (err: any) {
      setError(err.message || 'Failed to load brands');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBrands();
  }, []);

  const openForm = (brand?: SafeBrand) => {
    if (brand) {
      setEditingId(brand.id);
      setFormData({ name: brand.name, isActive: brand.isActive });
    } else {
      setEditingId(null);
      setFormData({ name: '', isActive: true });
    }
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
    
    try {
      if (editingId) {
        await fetchApi(`/catalogue/brands/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(formData)
        });
      } else {
        await fetchApi('/catalogue/brands', {
          method: 'POST',
          body: JSON.stringify(formData)
        });
      }
      await loadBrands();
      closeForm();
    } catch (err: any) {
      setError(err.message || 'Failed to save brand');
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchive = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to archive brand "${name}"?`)) return;
    try {
      await fetchApi(`/catalogue/brands/${id}/archive`, { method: 'POST' });
      await loadBrands();
    } catch (err: any) {
      setError(err.message || 'Failed to archive brand');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Brands</h2>
        {canWrite && !isFormOpen && (
          <Button onClick={() => openForm()}>Add Brand</Button>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-md border border-red-200">
          {error}
        </div>
      )}

      {isFormOpen ? (
        <Card className="p-6">
          <h3 className="text-lg font-bold mb-4">{editingId ? 'Edit Brand' : 'New Brand'}</h3>
          <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <Input
                required
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="E.g. Jaquar"
                disabled={submitting}
              />
            </div>
            {editingId && (
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                  disabled={submitting}
                />
                <label htmlFor="isActive" className="text-sm font-medium text-gray-700">Active</label>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving...' : 'Save Brand'}
              </Button>
              <Button type="button" variant="secondary" onClick={closeForm} disabled={submitting}>
                Cancel
              </Button>
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {brands.length === 0 ? (
                <tr><td colSpan={3} className="px-6 py-4 text-center text-gray-500">No brands found.</td></tr>
              ) : brands.map(brand => (
                <tr key={brand.id}>
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{brand.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {brand.isActive ? 
                      <span className="text-green-600 bg-green-50 px-2 py-1 rounded text-xs">Active</span> : 
                      <span className="text-gray-500 bg-gray-50 px-2 py-1 rounded text-xs">Archived</span>
                    }
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                    {canWrite && <Button variant="secondary" onClick={() => openForm(brand)}>Edit</Button>}
                    {canArchive && brand.isActive && (
                      <Button variant="secondary" onClick={() => handleArchive(brand.id, brand.name)}>Archive</Button>
                    )}
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
