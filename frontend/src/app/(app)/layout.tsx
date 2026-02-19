"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "@/lib/auth/AuthProvider";
import { useBackendHealth } from "@/lib/health/useBackendHealth";

function NavItem({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={[
        "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition",
        isActive ? "bg-gray-100 text-gray-900" : "text-gray-700 hover:bg-gray-50",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

function ProtectedShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const { user, isLoading, logout } = useAuth();
  const backendHealth = useBackendHealth();

  const healthLabel =
    backendHealth === "online"
      ? "Backend online"
      : backendHealth === "offline"
      ? "Backend offline"
      : "Checking backend";
  const healthColor =
    backendHealth === "online"
      ? "bg-emerald-500"
      : backendHealth === "offline"
      ? "bg-rose-500"
      : "bg-amber-500";

  useEffect(() => {
    const syncFromLocation = () => {
      const params = new URLSearchParams(window.location.search);
      setQ(params.get("q") ?? "");
    };
    syncFromLocation();
    window.addEventListener("popstate", syncFromLocation);
    return () => {
      window.removeEventListener("popstate", syncFromLocation);
    };
  }, [pathname]);

  function updateQuery(next: string) {
    const params = new URLSearchParams(window.location.search);
    if (!next.trim()) params.delete("q");
    else params.set("q", next);

    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-sm text-gray-600">Restoring session...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="flex">
        <aside className="hidden w-64 shrink-0 flex-col border-r bg-white px-4 py-6 md:flex">
          <div className="px-2">
            <div className="text-lg font-semibold text-gray-900">LearnEase</div>
            <div className="mt-1 text-xs text-gray-500">Study smarter, not harder</div>
          </div>

          <nav className="mt-6 space-y-1 px-1">
            <NavItem href="/dashboard" label="Dashboard" />
            <NavItem href="/upload" label="Upload" />
            <NavItem href="/settings" label="Settings" />
          </nav>

          <div className="mt-auto px-2 pt-6">
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-gray-900">Your privacy matters</p>
              <p className="mt-1 text-xs text-gray-500">
                Documents are encrypted and auto-deleted after 30 days
              </p>
            </div>
          </div>
        </aside>

        <div className="flex-1">
          <header className="sticky top-0 z-10 border-b bg-white">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
              <div className="flex w-full max-w-xl items-center gap-2 rounded-2xl border bg-white px-4 py-3">
                <span className="text-gray-400">🔍</span>
                <input
                  value={q}
                  onChange={(event) => {
                    const next = event.target.value;
                    setQ(next);
                    updateQuery(next);
                  }}
                  placeholder="Search documents..."
                  className="w-full bg-transparent text-sm outline-none"
                />
              </div>

              <div className="flex items-center gap-3">
                <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-gray-600">
                  <span className={`h-2.5 w-2.5 rounded-full ${healthColor}`} />
                  {healthLabel}
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-full border bg-white">
                  👤
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {user.name ?? user.email ?? "Profile"}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      void logout();
                    }}
                    className="text-xs text-gray-500 hover:text-gray-900"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ProtectedShell>{children}</ProtectedShell>
    </AuthProvider>
  );
}
