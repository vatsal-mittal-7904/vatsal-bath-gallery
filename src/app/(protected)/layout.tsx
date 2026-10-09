import { getAuthenticatedUser } from '@/features/auth/auth.guard';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/layout/AppHeader';

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-slate-50/70 flex flex-col text-slate-900">
      <AppHeader user={user} />
      <main className="flex-1 pb-12">{children}</main>
    </div>
  );
}

