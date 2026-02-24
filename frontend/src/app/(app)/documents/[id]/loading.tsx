export default function DocumentLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 animate-pulse">
      <div className="space-y-3">
        <div className="h-9 w-2/3 rounded-xl bg-gray-200" />
        <div className="h-4 w-1/3 rounded-lg bg-gray-100" />
      </div>
      <div className="flex gap-8 border-b pb-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-4 w-20 rounded bg-gray-100" />
        ))}
      </div>
      <div className="rounded-3xl border bg-white p-6 shadow-sm space-y-4">
        <div className="h-5 w-1/2 rounded bg-gray-200" />
        <div className="h-4 w-full rounded bg-gray-100" />
        <div className="h-4 w-5/6 rounded bg-gray-100" />
        <div className="h-4 w-4/6 rounded bg-gray-100" />
      </div>
    </div>
  );
}
