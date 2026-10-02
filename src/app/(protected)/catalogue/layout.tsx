import { getAuthenticatedUser, requirePermission } from '@/features/auth/auth.guard';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function CatalogueLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthenticatedUser();
  if (!user) return redirect('/login');
  
  // Entire catalogue needs read permission at minimum
  await requirePermission('catalogue:read');

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm px-6 py-4 flex justify-between items-center border-b">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            <Link href="/" className="hover:underline text-blue-600">Home</Link> / Catalogue
          </h1>
        </div>
      </header>
      
      <div className="flex flex-1">
        <aside className="w-64 bg-white border-r hidden md:block">
          <nav className="p-4 space-y-2">
            <Link href="/catalogue" className="block px-4 py-2 rounded-md hover:bg-gray-100 text-gray-700 font-medium">Overview</Link>
            <Link href="/catalogue/categories" className="block px-4 py-2 rounded-md hover:bg-gray-100 text-gray-700 font-medium">Categories</Link>
            <Link href="/catalogue/brands" className="block px-4 py-2 rounded-md hover:bg-gray-100 text-gray-700 font-medium">Brands</Link>
            <Link href="/catalogue/products" className="block px-4 py-2 rounded-md hover:bg-gray-100 text-gray-700 font-medium">Products</Link>
          </nav>
        </aside>

        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
