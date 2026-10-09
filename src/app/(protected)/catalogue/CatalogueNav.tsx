'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function CatalogueNav() {
  const pathname = usePathname();

  const links = [
    { href: '/catalogue', label: 'Overview', exact: true },
    { href: '/catalogue/categories', label: 'Categories' },
    { href: '/catalogue/brands', label: 'Brands' },
    { href: '/catalogue/products', label: 'Products' },
  ];

  return (
    <nav className="space-y-1 mt-2">
      {links.map((link) => {
        const isActive = link.exact
          ? pathname === link.href
          : pathname.startsWith(link.href);

        return (
          <Link
            key={link.href}
            href={link.href}
            className={`block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'bg-blue-50 text-blue-700 font-semibold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
