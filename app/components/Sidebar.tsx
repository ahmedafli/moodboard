'use client'

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Wand2, Home, Folder } from "lucide-react";

export default function Sidebar() {
  const pathname = usePathname();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    try {
      const username = typeof window !== 'undefined' ? localStorage.getItem('username') : null;
      setIsLoggedIn(Boolean(username));
    } catch {
      setIsLoggedIn(false);
    }
  }, [pathname]);

  if (pathname === '/login' || !isLoggedIn) {
    return null;
  }

  const linkClass = (isActive: boolean) =>
    isActive
      ? 'flex items-center gap-3 px-3 py-2 rounded-md bg-indigo-100 text-indigo-700 transition'
      : 'flex items-center gap-3 px-3 py-2 rounded-md text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition';

  const mobileLinkClass = (isActive: boolean) =>
    isActive
      ? 'flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-indigo-100 text-indigo-700 transition flex-1'
      : 'flex items-center justify-center gap-2 px-4 py-2 rounded-md text-gray-700 hover:bg-gray-100 transition flex-1';

  return (
    <>
      {/* Mobile: Top navbar */}
      <nav className="md:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200">
        <div className="h-14 flex items-center justify-around px-2">
          <Link href="/home" className={mobileLinkClass(pathname === '/home')}>
            <Home className="w-5 h-5" />
            <span className="text-sm font-medium">Home</span>
          </Link>
          <Link href="/builder" className={mobileLinkClass(pathname === '/builder')}>
            <Wand2 className="w-5 h-5" />
            <span className="text-sm font-medium">Create</span>
          </Link>
          <Link href="/projects" className={mobileLinkClass(pathname === '/projects')}>
            <Folder className="w-5 h-5" />
            <span className="text-sm font-medium">Projects</span>
          </Link>
        </div>
      </nav>

      {/* Desktop: Sidebar */}
      <aside className="hidden md:block w-64 bg-white border-r border-gray-200">
        <div className="h-16 flex items-center px-4 border-b border-gray-200">
          <span className="text-lg font-semibold text-gray-900">Dashboard</span>
        </div>
        <nav className="p-2 space-y-1">
          <Link href="/home" className={linkClass(pathname === '/home')}>
            <Home className="w-5 h-5" />
            <span className="text-sm font-medium">Home</span>
          </Link>
          <Link href="/builder" className={linkClass(pathname === '/builder')}>
            <Wand2 className="w-5 h-5" />
            <span className="text-sm font-medium">Create Moodboard</span>
          </Link>
          <Link href="/projects" className={linkClass(pathname === '/projects')}>
            <Folder className="w-5 h-5" />
            <span className="text-sm font-medium">Projects</span>
          </Link>
        </nav>
      </aside>
    </>
  );
}


