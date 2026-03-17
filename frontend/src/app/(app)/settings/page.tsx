"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteAllUserData } from "@/lib/data/documents";
import { getErrorMessage } from "@/lib/errorUx";

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" fill="none" aria-hidden="true">
      <path
        d="M12 3l7 3v5c0 4.5-2.9 8.4-7 9.7C7.9 19.4 5 15.5 5 11V6l7-3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DatabaseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-gray-700" fill="none" aria-hidden="true">
      <ellipse cx="12" cy="6" rx="7" ry="3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-rose-600" fill="none" aria-hidden="true">
      <path
        d="M4 7h16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M9 4h6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M8 7v11a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 11v5M14 11v5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDeleteAllData() {
    if (isDeletingAll) return;

    const confirmed = window.confirm(
      "Delete all your documents and generated data permanently? This action cannot be undone."
    );
    if (!confirmed) return;

    setIsDeletingAll(true);
    setError(null);
    setMessage(null);

    try {
      await deleteAllUserData();
      setMessage("All account data was deleted successfully.");
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(getErrorMessage(err, "Unable to delete user data right now."));
    } finally {
      setIsDeletingAll(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 pb-4 sm:space-y-8 sm:pb-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-950 sm:text-3xl">Settings</h1>
        <p className="mt-2 text-sm text-gray-500">
          Manage your LearnEase data settings and account safety controls.
        </p>
      </div>

      <section className="overflow-hidden rounded-[28px] border border-gray-200 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.16),_rgba(255,255,255,0.04)),linear-gradient(135deg,#0f172a_0%,#111827_55%,#1f2937_100%)] p-5 text-white shadow-[0_12px_32px_rgba(15,23,42,0.14)] sm:p-7">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-inset ring-white/10">
            <ShieldIcon />
          </div>

          <div className="max-w-2xl">
            <h2 className="text-xl font-semibold">Your data is protected</h2>
            <p className="mt-3 text-sm leading-7 text-white/80">
              LearnEase stores uploaded academic documents and generated study materials with privacy in mind. Uploaded files are encrypted at rest and handled according to backend retention policies.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-gray-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)] sm:p-7">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-gray-200 bg-gray-50">
            <DatabaseIcon />
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold text-gray-950">Data retention</h2>
            <p className="mt-2 text-sm leading-7 text-gray-600">
              Uploaded files are encrypted at rest and retained based on backend retention policies. Generated study materials are stored with your account until they are removed by retention rules or deleted manually through account actions.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
                  Encryption
                </p>
                <p className="mt-2 text-sm font-medium text-gray-900">Encrypted at rest</p>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
                  Retention
                </p>
                <p className="mt-2 text-sm font-medium text-gray-900">
                  Managed by backend policy
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-rose-200 bg-rose-50/80 p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)] sm:p-7">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-100 ring-1 ring-inset ring-rose-200">
            <TrashIcon />
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold text-rose-800">Danger zone</h2>
            <p className="mt-2 text-sm leading-7 text-rose-700">
              Permanently delete all uploaded documents and generated study materials for your account. This action cannot be undone.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  void handleDeleteAllData();
                }}
                disabled={isDeletingAll}
                className="inline-flex items-center justify-center rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeletingAll ? "Deleting..." : "Delete all account data"}
              </button>

              <p className="text-xs font-medium text-rose-600">
                Includes documents and generated study outputs.
              </p>
            </div>
          </div>
        </div>
      </section>

      {message ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
    </div>
  );
}
