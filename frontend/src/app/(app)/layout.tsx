"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  BookOpenCheck,
  FileText,
  LayoutDashboard,
  LogOut,
  Search,
  Settings,
  ShieldCheck,
  Upload,
  UserCircle,
} from "lucide-react";
import { AuthProvider, useAuth } from "@/lib/auth/AuthProvider";

const SEARCH_DEBOUNCE_MS = 300;

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function NavItem({ href, label, compact = false }: {
  href: string;
  label: string;
  compact?: boolean;
}) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(`${href}/`);
  const item = navItems.find((navItem) => navItem.href === href);
  const Icon = item?.icon;

  return (
    <Link
      href={href}
      className={[
        "flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition",
        compact
          ? isActive
            ? "bg-[#123c38] text-white shadow-sm"
            : "bg-white/70 text-[#52615d] ring-1 ring-[#d9e3dc] hover:bg-white hover:text-[#123c38]"
          : isActive
            ? "bg-white/12 text-white ring-1 ring-white/16"
            : "text-emerald-50/78 hover:bg-white/8 hover:text-white",
      ].join(" ")}
    >
      {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
      {label}
    </Link>
  );
}

function ProtectedShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const { user, isLoading, hasSessionCheckError, refreshSession, logout } = useAuth();

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
      <div className="flex min-h-screen items-center justify-center bg-[#eef4ec]">
        <div className="rounded-lg border border-[#d9e3dc] bg-white/85 px-5 py-4 shadow-sm">
          <p className="text-sm font-medium text-[#52615d]">Restoring session...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (hasSessionCheckError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#eef4ec] px-6">
          <div className="w-full max-w-lg rounded-lg border border-amber-200 bg-[#fffaf0] p-8 shadow-sm">
            <h1 className="text-xl font-semibold text-[#10201d]">Can&apos;t verify session</h1>
            <p className="mt-2 text-sm leading-6 text-[#61716d]">
              LearnEase couldn&apos;t reach the backend to verify your session. Retry when the
              connection is stable.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  void refreshSession();
                }}
                className="rounded-lg bg-[#123c38] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0d2d2a]"
              >
                Retry
              </button>
              <Link
                href="/signin"
                className="rounded-lg border border-[#d5ded8] bg-white px-4 py-2 text-sm font-semibold text-[#10201d] transition hover:bg-[#f7faf6]"
              >
                Go to Sign in
              </Link>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-[#eef4ec]">
        <p className="text-sm font-medium text-[#52615d]">Redirecting to sign in...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#eef4ec]">
      <div className="md:flex md:min-h-screen">
        <aside className="hidden w-64 shrink-0 flex-col bg-[#123c38] px-4 py-6 text-white md:flex lg:w-72">
          <div className="px-2">
            <Link href="/dashboard" className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#d5f36b] text-[#123c38] shadow-sm">
                <BookOpenCheck className="h-5 w-5" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-lg font-semibold leading-tight">LearnEase</span>
                <span className="mt-1 block text-xs font-medium text-emerald-50/68">
                  Study workspace
                </span>
              </span>
            </Link>
          </div>

          <nav className="mt-6 space-y-1 px-1">
            {navItems.map((item) => (
              <NavItem key={item.href} href={item.href} label={item.label} />
            ))}
          </nav>

          <div className="mt-auto px-2 pt-6">
            <div className="rounded-lg border border-white/12 bg-white/8 p-4 shadow-sm">
              <div className="flex items-center gap-2 text-[#d5f36b]">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                <p className="text-xs font-semibold text-white">Private by default</p>
              </div>
              <p className="mt-2 text-xs leading-5 text-emerald-50/70">
                Documents are encrypted and auto-deleted after 30 days
              </p>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-[#dbe5de] bg-[#f7faf5]/92 backdrop-blur">
            <div className="mx-auto w-full max-w-screen-2xl px-4 py-3 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between gap-3 md:hidden">
                <Link href="/dashboard" className="flex min-w-0 items-center gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#123c38] text-[#d5f36b]">
                    <BookOpenCheck className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <p className="truncate text-base font-semibold text-[#10201d]">LearnEase</p>
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    void logout();
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-[#d5ded8] bg-white/80 px-3 py-1.5 text-xs font-semibold text-[#52615d] hover:bg-white hover:text-[#123c38]"
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  Sign out
                </button>
              </div>

              <div className="mt-3 flex flex-col gap-3 md:mt-0 md:flex-row md:items-center md:justify-between md:gap-4">
                <div className="flex w-full items-center gap-3 rounded-lg border border-[#ccd9d0] bg-white/90 px-4 py-3 shadow-sm md:max-w-xl lg:max-w-2xl">
                  <Search className="h-4 w-4 shrink-0 text-[#77867f]" aria-hidden="true" />
                  <input
                    value={q}
                    onChange={(event) => {
                      setQ(event.target.value);
                    }}
                    placeholder="Search documents..."
                    className="w-full min-w-0 bg-transparent text-sm text-[#10201d] outline-none placeholder:text-[#8a9891]"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:gap-3 md:justify-end">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[#ccd9d0] bg-white text-[#123c38] shadow-sm sm:h-10 sm:w-10">
                    <UserCircle className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="hidden min-w-0 sm:block">
                    <p className="truncate text-sm font-semibold text-[#10201d]">
                      {user.name ?? user.email ?? "Profile"}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        void logout();
                      }}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#6b7a73] hover:text-[#123c38]"
                    >
                      <LogOut className="h-3 w-3" aria-hidden="true" />
                      Sign out
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="mx-auto w-full max-w-screen-2xl px-4 pb-2 sm:px-6 lg:px-8">
              <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 md:hidden">
                {navItems.map((item) => (
                  <NavItem key={item.href} href={item.href} label={item.label} compact />
                ))}
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
