export default function AppLoading() {
  return (
    <div className="mx-auto w-full max-w-4xl py-2 sm:py-4">
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-56 rounded-lg bg-[#dbe5de]" />
        <div className="h-4 w-80 rounded bg-[#edf3ee]" />
        <div className="rounded-lg border border-[#d9e3dc] bg-white/80 p-6 shadow-sm">
          <div className="space-y-3">
            <div className="h-4 w-full rounded bg-[#edf3ee]" />
            <div className="h-4 w-5/6 rounded bg-[#edf3ee]" />
            <div className="h-4 w-4/6 rounded bg-[#edf3ee]" />
          </div>
        </div>
      </div>
    </div>
  );
}
