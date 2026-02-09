"use client";

import { Search, User } from "lucide-react";

export default function Topbar() {
  return (
    <header className="sticky top-0 z-10 border-b bg-white">
      <div className="flex items-center justify-between px-10 py-4">
        <div className="flex w-full max-w-xl items-center gap-2 rounded-full border px-4 py-2 text-sm text-gray-600">
          <Search size={16} className="text-gray-400" />
          <input
            className="w-full outline-none placeholder:text-gray-400"
            placeholder="Search documents..."
          />
        </div>

        <div className="ml-6 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full border bg-white">
            <User size={18} className="text-gray-600" />
          </div>
          <div className="text-sm font-medium text-gray-800">Profile</div>
        </div>
      </div>
    </header>
  );
}
