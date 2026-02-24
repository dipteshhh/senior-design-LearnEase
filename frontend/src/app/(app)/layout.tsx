"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AuthProvider, useAuth } from "@/lib/auth/AuthProvider";
import { useBackendHealth } from "@/lib/health/useBackendHealth";

const SEARCH_DEBOUNCE_MS = 300;

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
  const { user, isLoading, hasSessionCheckError, refreshSession, logout } = useAuth();
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

  const updateQuery = useCallback((next: string) => {
    const normalized = next.trim();
    const currentPathname = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    if (!normalized) params.delete("q");
    else params.set("q", normalized);

    const qs = params.toString();
    const target = qs ? `${currentPathname}?${qs}` : currentPathname;
    const current = `${currentPathname}${window.location.search}`;
    if (target === current) return;
    router.replace(target, { scroll: false });
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      updateQuery(q);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [q, updateQuery]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-sm text-gray-600">Restoring session...</p>
      </div>
    );
  }

  if (!user) {
    if (hasSessionCheckError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-white px-6">
          <div className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-8 shadow-sm">
            <h1 className="text-xl font-semibold text-gray-900">Can&apos;t verify session</h1>
            <p className="mt-2 text-sm text-gray-600">
              LearnEase couldn&apos;t reach the backend to verify your session. Retry when the
              connection is stable.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  void refreshSession();
                }}
                className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
              >
                Retry
              </button>
              <Link
                href="/signin"
                className="rounded-xl border px-4 py-2 text-sm font-semibold text-gray-900"
              >
                Go to Sign in
              </Link>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-sm text-gray-600">Redirecting to sign in...</p>
      </div>
    );
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
                    setQ(event.target.value);
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
