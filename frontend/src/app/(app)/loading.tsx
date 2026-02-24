export default function AppLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-56 rounded-lg bg-gray-200" />
        <div className="h-4 w-80 rounded bg-gray-100" />
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="space-y-3">
            <div className="h-4 w-full rounded bg-gray-100" />
            <div className="h-4 w-5/6 rounded bg-gray-100" />
            <div className="h-4 w-4/6 rounded bg-gray-100" />
          </div>
        </div>
      </div>
    </div>
  );
}
