import { getAuthenticatedUser, requirePermission } from '@/features/auth/auth.guard';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { CatalogueNav } from './CatalogueNav';

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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <Link href="/" className="hover:text-blue-600 transition-colors">
          Home
        </Link>
        <span>/</span>
        <span className="text-slate-900 font-semibold">Catalogue</span>
      </div>

      <div className="flex flex-col md:flex-row gap-6 items-start">
        <aside className="w-full md:w-56 shrink-0 bg-white border border-slate-200/80 rounded-xl p-3 shadow-xs">
          <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Catalogue Menu
          </div>
          <CatalogueNav />
        </aside>

        <main className="flex-1 min-w-0 w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
