import { requirePermission } from '@/features/auth/auth.guard';
import DashboardClient from './DashboardClient';

export default async function DashboardPage() {
  // Enforce role-based access for the dashboard
  const user = await requirePermission('dashboard:read');

  return <DashboardClient user={user} />;
}
