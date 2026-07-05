import Link from "next/link";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#eef4ec] px-6">
      <div className="w-full max-w-xl rounded-lg border border-[#d9e3dc] bg-[#fbfcf8] p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-[#10201d]">Page not found</h1>
        <p className="mt-2 text-sm text-[#61716d]">
          The page you requested does not exist or is no longer available.
        </p>
        <div className="mt-5">
          <Link
            href="/"
            className="inline-flex rounded-lg bg-[#123c38] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d2d2a]"
          >
            Go to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
