import Link from "next/link";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="w-full max-w-xl rounded-2xl border bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">Page not found</h1>
        <p className="mt-2 text-sm text-gray-600">
          The page you requested does not exist or is no longer available.
        </p>
        <div className="mt-5">
          <Link
            href="/"
            className="inline-flex rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
          >
            Go to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
