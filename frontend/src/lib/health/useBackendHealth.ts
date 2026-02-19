"use client";

import { useEffect, useState } from "react";

type BackendHealth = "checking" | "online" | "offline";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

export function useBackendHealth(): BackendHealth {
  const [health, setHealth] = useState<BackendHealth>("checking");

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const runCheck = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/health`, {
          method: "GET",
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as { status?: string };
        if (!cancelled) {
          setHealth(response.ok && payload.status === "ok" ? "online" : "offline");
        }
      } catch {
        if (!cancelled) {
          setHealth("offline");
        }
      }
    };

    void runCheck();
    intervalId = setInterval(() => {
      void runCheck();
    }, 30000);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  return health;
}
