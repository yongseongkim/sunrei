'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/query-client';
import { useEffect } from 'react';
import { auth } from '@/lib/auth';
import { useRouter, usePathname } from 'next/navigation';

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Check authentication on mount - redirect to login if not authenticated
    // Skip redirect if already on login or forbidden page
    if (!auth.isAuthenticated() && pathname !== '/login' && pathname !== '/forbidden') {
      router.push('/login');
    }
  }, [router, pathname]);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
