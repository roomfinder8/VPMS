/**
 * Shown automatically by Next.js while page.tsx's data is loading - most
 * often the moment between clicking a date in DateNav and the new day's
 * visits arriving. Kept intentionally plain (no layout-shifting skeleton
 * boxes) since it is only ever on screen for a fraction of a second.
 */
export default function Loading() {
  return (
    <div className="flex flex-col items-center gap-3 py-24 text-ink-faint">
      <span
        aria-hidden="true"
        className="h-6 w-6 animate-spin rounded-full border-2 border-ink-faint border-t-transparent"
      />
      <p className="text-sm">Loading…</p>
    </div>
  );
}
