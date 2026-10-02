/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps */
'use client';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { fetchApi } from '@/lib/api-client';

export default function CatalogueOverview() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ categories: 0, brands: 0, products: 0 });
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadStats() {
      try {
        const [cats, brands, prods] = await Promise.all([
          fetchApi<{ total: number }>('/catalogue/categories?limit=1&isActive=true'),
          fetchApi<{ total: number }>('/catalogue/brands?limit=1&isActive=true'),
          fetchApi<{ total: number }>('/catalogue/products?limit=1&isActive=true')
        ]);
        setStats({
          categories: cats.total,
          brands: brands.total,
          products: prods.total
        });
      } catch (err: any) {
        setError(err.message || 'Failed to load stats');
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Catalogue Overview</h2>
      
      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-md border border-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center p-12"><Spinner /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-6 text-center">
            <h3 className="text-sm font-medium text-gray-500 uppercase">Active Categories</h3>
            <p className="text-4xl font-bold text-blue-600 mt-2">{stats.categories}</p>
          </Card>
          <Card className="p-6 text-center">
            <h3 className="text-sm font-medium text-gray-500 uppercase">Active Brands</h3>
            <p className="text-4xl font-bold text-blue-600 mt-2">{stats.brands}</p>
          </Card>
          <Card className="p-6 text-center">
            <h3 className="text-sm font-medium text-gray-500 uppercase">Active Products</h3>
            <p className="text-4xl font-bold text-blue-600 mt-2">{stats.products}</p>
          </Card>
        </div>
      )}
    </div>
  );
}
