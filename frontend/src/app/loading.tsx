export default function RootLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="flex flex-col items-center text-center">
        
        {/* Logo */}
        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-slate-900 text-white shadow-sm">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-7 w-7"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.8}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 6h7v12H4zM13 6h7v12h-7z"
            />
          </svg>
        </div>

        {/* Title */}
        <h2 className="mt-6 text-lg font-semibold text-slate-900">
          Loading LearnEase
        </h2>

        <p className="mt-2 text-sm text-slate-600">
          Preparing your study workspace...
        </p>

        {/* Spinner */}
        <div className="mt-6 h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />

      </div>
    </div>
  );
}