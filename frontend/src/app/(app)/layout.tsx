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
        "flex items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition",
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
      <div className="md:flex md:min-h-screen">
        <aside className="hidden w-64 shrink-0 flex-col border-r bg-white px-4 py-6 md:flex lg:w-72">
          <div className="px-2">
            <div className="text-lg font-semibold text-gray-900">LearnEase</div>
            <div className="mt-1 text-xs text-gray-500">Study smarter, not harder</div>
          </div>

          <nav className="mt-6 space-y-1 px-1">
            <NavItem href="/dashboard" label="Dashboard" />
            <NavItem href="/upload" label="Upload" />
            <NavItem href="/documents" label="Documents" />
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

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b bg-white/95 backdrop-blur">
            <div className="mx-auto w-full max-w-screen-2xl px-4 py-3 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between gap-3 md:hidden">
                <Link href="/dashboard" className="min-w-0">
                  <p className="truncate text-base font-semibold text-gray-900">LearnEase</p>
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    void logout();
                  }}
                  className="rounded-lg border px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                >
                  Sign out
                </button>
              </div>

              <div className="mt-3 flex flex-col gap-3 md:mt-0 md:flex-row md:items-center md:justify-between md:gap-4">
                <div className="flex w-full items-center gap-2 rounded-2xl border bg-white px-4 py-3 md:max-w-xl lg:max-w-2xl">
                  <span className="text-gray-400">🔍</span>
                  <input
                    value={q}
                    onChange={(event) => {
                      setQ(event.target.value);
                    }}
                    placeholder="Search documents..."
                    className="w-full min-w-0 bg-transparent text-sm outline-none"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:gap-3 md:justify-end">
                  <div className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] text-gray-600 sm:px-3 sm:text-xs">
                    <span className={`h-2.5 w-2.5 rounded-full ${healthColor}`} />
                    <span className="hidden sm:inline">{healthLabel}</span>
                    <span className="sm:hidden">
                      {backendHealth === "online"
                        ? "Online"
                        : backendHealth === "offline"
                        ? "Offline"
                        : "Checking"}
                    </span>
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border bg-white text-sm sm:h-10 sm:w-10">
                    👤
                  </div>
                  <div className="hidden min-w-0 sm:block">
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
            </div>

            <div className="mx-auto w-full max-w-screen-2xl px-4 pb-2 sm:px-6 lg:px-8">
              <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 md:hidden">
                <NavItem href="/dashboard" label="Dashboard" />
                <NavItem href="/upload" label="Upload" />
                <NavItem href="/documents" label="Documents" />
                <NavItem href="/settings" label="Settings" />
              </nav>
            </div>
          </header>

          <main className="mx-auto w-full max-w-screen-2xl flex-1 px-4 py-5 sm:px-6 sm:py-7 lg:px-8 lg:py-10">
            {children}
          </main>
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
