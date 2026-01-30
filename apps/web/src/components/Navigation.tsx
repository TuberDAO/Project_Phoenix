'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity } from 'lucide-react';

export function Navigation() {
  const pathname = usePathname();

  const isActive = (path: string) => pathname === path;

  return (
    <nav className="border-b bg-white shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center space-x-8">
            <Link href="/" className="flex items-center space-x-2">
              <Activity className="h-6 w-6 text-blue-600" />
              <span className="text-xl font-bold text-slate-900">Project Phoenix</span>
            </Link>

            <div className="hidden md:flex space-x-6">
              <Link
                href="/"
                className={`text-sm font-medium transition-colors hover:text-blue-600 ${
                  isActive('/') ? 'text-blue-600' : 'text-slate-600'
                }`}
              >
                Dashboard
              </Link>
              <Link
                href="/markets"
                className={`text-sm font-medium transition-colors hover:text-blue-600 ${
                  isActive('/markets') ? 'text-blue-600' : 'text-slate-600'
                }`}
              >
                Markets
              </Link>
            </div>
          </div>

          <div className="text-xs text-slate-500">
            Insider Detection System
          </div>
        </div>
      </div>
    </nav>
  );
}

