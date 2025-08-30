'use client';

import { auth } from '@/lib/auth';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navigation = [
  { name: 'Dashboard', href: '/' },
  { name: 'Sunreis', href: '/sunreis' },
  { name: 'Spots', href: '/spots' },
  { name: 'Places', href: '/places' },
  { name: 'Tags', href: '/tags' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-screen bg-gray-800 w-64">
      <div className="flex flex-col w-full">
        <div className="flex items-center justify-center h-16 bg-gray-900">
          <h1 className="text-white text-xl font-bold">Sunrei Admin</h1>
        </div>
        <nav className="flex-1 px-2 py-4">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={`
                block px-4 py-2 mt-2 text-sm font-semibold rounded-lg
                ${
                  pathname === item.href
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }
              `}
            >
              {item.name}
            </Link>
          ))}
        </nav>
        <div className="px-2 py-4 border-t border-gray-700">
          <button
            onClick={() => auth.logout()}
            className="block w-full px-4 py-2 text-sm font-semibold text-gray-400 rounded-lg hover:text-white hover:bg-gray-700"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}