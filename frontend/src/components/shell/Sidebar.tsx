"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Upload, Settings } from "lucide-react";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 min-h-screen border-r bg-white px-6 py-6">
      <div className="mb-10">
        <div className="text-xl font-semibold">LearnEase</div>
        <div className="text-sm text-gray-500">Study smarter, not harder</div>
      </div>

      <nav className="space-y-2">
        {nav.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition",
                active
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
              ].join(" ")}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-10">
        <div className="rounded-xl border bg-gray-50 p-4 text-xs text-gray-600">
          <div className="font-medium text-gray-800">🔒 Your privacy matters</div>
          <div className="mt-1">Documents are encrypted and auto-deleted after 30 days</div>
        </div>
      </div>
    </aside>
  );
}
