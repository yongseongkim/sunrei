'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppSidebar } from '@/components/app-sidebar';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { auth } from '@/lib/auth';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const authenticated = auth.isAuthenticated();
    setIsAuthenticated(authenticated);

    if (!authenticated) {
      router.push('/login');
    }

    setIsChecking(false);
  }, [router]);

  if (isChecking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto bg-muted/10">
          <div className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background px-6">
            <SidebarTrigger />
          </div>
          <div className="p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
