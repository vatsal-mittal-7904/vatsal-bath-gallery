import { Suspense } from 'react';
import LoginForm from './LoginForm';
import { Spinner } from '@/components/ui/Spinner';

export default function LoginPage() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
      <Suspense fallback={<Spinner />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
