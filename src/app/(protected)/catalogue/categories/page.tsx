/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
'use client';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { fetchApi } from '@/lib/api-client';
import { SafeCategory } from '@/features/catalogue/catalogue.types';
import { useAuth } from '@/components/auth/AuthProvider';
import { hasPermission } from '@/features/auth/permissions';

export default function CategoriesPage() {
  const [categories, setCategories] = useState<SafeCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', parentId: '', isActive: true });
  const [submitting, setSubmitting] = useState(false);

  const { user } = useAuth();
  const canWrite = user ? hasPermission(user.role, 'catalogue:create') : false;
  const canArchive = user ? hasPermission(user.role, 'catalogue:archive') : false;

  const loadCategories = async () => {
    setLoading(true);
    try {
      const res = await fetchApi<{ items: SafeCategory[] }>('/catalogue/categories?limit=500');
      setCategories(res.items);
    } catch (err: any) {
      setError(err.message || 'Failed to load categories');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const openForm = (cat?: SafeCategory) => {
    if (cat) {
      setEditingId(cat.id);
      setFormData({ name: cat.name, parentId: cat.parentId || '', isActive: cat.isActive });
    } else {
      setEditingId(null);
      setFormData({ name: '', parentId: '', isActive: true });
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
    
    const payload = {
      name: formData.name,
      isActive: formData.isActive,
      parentId: formData.parentId || null
    };

    try {
      if (editingId) {
        await fetchApi(`/catalogue/categories/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
      } else {
        await fetchApi('/catalogue/categories', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }
      await loadCategories();
      closeForm();
    } catch (err: any) {
      setError(err.message || 'Failed to save category');
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchive = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to archive category "${name}"? Dependencies will block this action if active.`)) return;
    try {
      await fetchApi(`/catalogue/categories/${id}/archive`, { method: 'POST' });
      await loadCategories();
    } catch (err: any) {
      setError(err.message || 'Failed to archive category');
    }
  };

  // Build a simple tree for visual indent
  const getParentName = (parentId: string | null) => {
    if (!parentId) return '-';
    return categories.find(c => c.id === parentId)?.name || 'Unknown';
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Categories</h2>
        {canWrite && !isFormOpen && (
          <Button onClick={() => openForm()}>Add Category</Button>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-md border border-red-200">
          {error}
        </div>
      )}

      {isFormOpen ? (
        <Card className="p-6">
          <h3 className="text-lg font-bold mb-4">{editingId ? 'Edit Category' : 'New Category'}</h3>
          <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <Input
                required
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                disabled={submitting}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Parent Category</label>
              <select 
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.parentId}
                onChange={(e) => setFormData(prev => ({ ...prev, parentId: e.target.value }))}
                disabled={submitting}
              >
                <option value="">-- None (Root Category) --</option>
                {categories.map(c => {
                  if (c.id === editingId) return null; // Prevent self-parenting trivially
                  return <option key={c.id} value={c.id}>{c.name} {c.isActive ? '' : '(Inactive)'}</option>;
                })}
              </select>
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
                {submitting ? 'Saving...' : 'Save Category'}
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Parent</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {categories.length === 0 ? (
                <tr><td colSpan={4} className="px-6 py-4 text-center text-gray-500">No categories found.</td></tr>
              ) : categories.map(cat => (
                <tr key={cat.id}>
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{cat.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{getParentName(cat.parentId)}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {cat.isActive ? 
                      <span className="text-green-600 bg-green-50 px-2 py-1 rounded text-xs">Active</span> : 
                      <span className="text-gray-500 bg-gray-50 px-2 py-1 rounded text-xs">Archived</span>
                    }
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                    {canWrite && <Button variant="secondary" onClick={() => openForm(cat)}>Edit</Button>}
                    {canArchive && cat.isActive && (
                      <Button variant="secondary" onClick={() => handleArchive(cat.id, cat.name)}>Archive</Button>
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
