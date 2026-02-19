"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteAllUserData } from "@/lib/data/documents";
import { getErrorMessage } from "@/lib/errorUx";

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
      setMessage("All user data deleted successfully.");
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(getErrorMessage(err, "Unable to delete user data right now."));
    } finally {
      setIsDeletingAll(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-3xl font-semibold text-gray-900">Settings</h1>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Data retention</h2>
        <p className="mt-2 text-sm text-gray-600">
          Uploaded files are encrypted at rest and retained based on backend retention policies.
        </p>
      </section>

      <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-rose-800">Danger zone</h2>
        <p className="mt-2 text-sm text-rose-700">
          Permanently delete all documents and generated study artifacts for your account.
        </p>
        <button
          type="button"
          onClick={() => {
            void handleDeleteAllData();
          }}
          disabled={isDeletingAll}
          className="mt-4 rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isDeletingAll ? "Deleting..." : "Delete all user data"}
        </button>
      </section>

      {message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
    </div>
  );
}
