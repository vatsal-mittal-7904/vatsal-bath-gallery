import { Suspense } from 'react';
import LoginForm from './LoginForm';
import { Spinner } from '@/components/ui/Spinner';

export default function LoginPage() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-gray-50 via-slate-50 to-gray-100/70 p-4 sm:p-6">
      <Suspense fallback={<Spinner />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}

