"use client";

import { useEffect } from "react";

interface RootErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function RootError({ error, reset }: RootErrorProps) {
  useEffect(() => {
    console.error("Root error boundary caught an error", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#eef4ec] px-6">
      <div className="w-full max-w-xl rounded-lg border border-rose-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-[#10201d]">Something went wrong</h1>
        <p className="mt-2 text-sm text-[#61716d]">
          We hit an unexpected error while loading the app.
        </p>
        <div className="mt-5">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-[#123c38] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d2d2a]"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
