"use client";

import { useEffect } from "react";

interface AppErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AppError({ error, reset }: AppErrorProps) {
  useEffect(() => {
    console.error("App route error boundary caught an error", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-3xl rounded-2xl border border-rose-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-semibold text-gray-900">Something went wrong</h1>
      <p className="mt-2 text-sm text-gray-600">
        An unexpected error occurred while loading this page.
      </p>
      <div className="mt-5">
        <button
          type="button"
          onClick={reset}
          className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

