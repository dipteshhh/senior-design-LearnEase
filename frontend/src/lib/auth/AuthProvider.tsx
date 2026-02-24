"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { ApiClientError, api } from "@/lib/api";
import type { AuthMeResponse, AuthUser } from "@/lib/contracts";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  hasSessionCheckError: boolean;
  refreshSession: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasSessionCheckError, setHasSessionCheckError] = useState(false);

  const redirectToSignIn = useCallback(() => {
    if (pathname === "/signin") return;
    const qs = typeof window !== "undefined" ? window.location.search : "";
    const returnTo = qs.length > 0 ? `${pathname}${qs}` : pathname;
    router.replace(`/signin?returnTo=${encodeURIComponent(returnTo)}`);
  }, [pathname, router]);

  const refreshSession = useCallback(async () => {
    try {
      const response = await api<AuthMeResponse>("/api/auth/me", {}, {
        suppressUnauthorizedEvent: true,
      });
      setHasSessionCheckError(false);
      setUser(response.user);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        setHasSessionCheckError(false);
        setUser(null);
        return;
      }
      setHasSessionCheckError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api<{ success: boolean }>(
        "/api/auth/logout",
        {
          method: "POST",
        },
        { suppressUnauthorizedEvent: true }
      );
    } finally {
      setUser(null);
      redirectToSignIn();
    }
  }, [redirectToSignIn]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    const handleUnauthorized = () => {
      setHasSessionCheckError(false);
      setUser(null);
      redirectToSignIn();
    };

    window.addEventListener("learnease:unauthorized", handleUnauthorized);
    return () => {
      window.removeEventListener("learnease:unauthorized", handleUnauthorized);
    };
  }, [redirectToSignIn]);

  useEffect(() => {
    if (!isLoading && !user && !hasSessionCheckError) {
      redirectToSignIn();
    }
  }, [hasSessionCheckError, isLoading, redirectToSignIn, user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      hasSessionCheckError,
      refreshSession,
      logout,
    }),
    [hasSessionCheckError, isLoading, logout, refreshSession, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
