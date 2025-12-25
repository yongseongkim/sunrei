'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/query-client';
import { useEffect, useState } from 'react';
import { auth } from '@/lib/auth';
import { useRouter } from 'next/navigation';

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Check authentication on mount
    if (!auth.isAuthenticated()) {
      // Only redirect to login if not already there
      if (window.location.pathname !== '/login') {
        router.push('/login');
      }
    }
    setIsChecking(false);
  }, [router]);

  if (isChecking) {
    return null; // or a loading spinner
  }

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
