'use client'

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Wand2, Home } from "lucide-react";

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

  return (
    <aside className="w-64 bg-white border-r border-gray-200">
      <div className="h-16 flex items-center px-4 border-b border-gray-200">
        <span className="text-lg font-semibold text-gray-900">Dashboard</span>
      </div>
      <nav className="p-2 space-y-1">
        <Link
          href="/home"
          className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition"
        >
          <Home className="w-5 h-5" />
          <span className="text-sm font-medium">Home</span>
        </Link>
        <Link
          href="/builder"
          className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition"
        >
          <Wand2 className="w-5 h-5" />
          <span className="text-sm font-medium">Create Moodboard</span>
        </Link>
      </nav>
    </aside>
  );
}


