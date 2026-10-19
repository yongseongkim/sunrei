'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppSidebar } from '@/components/app-sidebar';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
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
          <div className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background px-5 text-sm">
            <SidebarTrigger className="text-muted-foreground" />
            <Separator orientation="vertical" className="!h-4" />
            <Breadcrumb />
          </div>
          <div className="p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

const SECTIONS: [string, string][] = [
  ['/sunreis', 'Content'],
  ['/sources', 'Channels / Sources'],
  ['/places', 'Places'],
  ['/tags', 'Tags'],
];

/** 상단 바에 지금 화면의 위치를 "Sunrei Admin › 화면"으로 보여 준다. */
function Breadcrumb() {
  const pathname = usePathname();
  const section = SECTIONS.find(([href]) => pathname.startsWith(href));
  let page = section?.[1] ?? 'Content';
  if (pathname === '/sunreis/new') page = 'New Sunrei';
  else if (/^\/sunreis\/[^/]+\/edit/.test(pathname)) page = 'Edit Sunrei';
  else if (pathname === '/sources/new') page = 'New Source';
  else if (/^\/sources\/[^/]+\/edit/.test(pathname)) page = 'Edit Source';
  else if (/^\/tags\/[^/]+/.test(pathname)) page = 'Tag';
  return (
    <nav className="flex items-center gap-2 text-muted-foreground" aria-label="Breadcrumb">
      <span>Sunrei Admin</span>
      <span>›</span>
      <span className="font-semibold text-foreground">{page}</span>
    </nav>
  );
}
