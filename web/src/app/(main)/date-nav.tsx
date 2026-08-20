"use client";

import { useRouter } from "next/navigation";
import { addDays } from "@/lib/tz";

interface Props {
  date: string;
  today: string;
}

/**
 * Jumps between days by pushing ?date=YYYY-MM-DD, or the bare "/" for today so
 * the common case keeps a clean URL. Forward is capped at today - there are
 * never visits to show for a future date, and allowing it would only invite a
 * mistyped year to go unnoticed.
 */
export function DateNav({ date, today }: Props) {
  const router = useRouter();
  const isToday = date === today;
  const canGoForward = date < today;

  function go(next: string) {
    router.push(next === today ? "/" : `/?date=${next}`);
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-label="Previous day"
        onClick={() => go(addDays(date, -1))}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line
                   text-ink-soft transition hover:bg-surface active:scale-[0.98]"
      >
        ‹
      </button>
      <button
        type="button"
        aria-label="Next day"
        onClick={() => canGoForward && go(addDays(date, 1))}
        disabled={!canGoForward}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line
                   text-ink-soft transition hover:bg-surface active:scale-[0.98]
                   disabled:opacity-30 disabled:pointer-events-none"
      >
        ›
      </button>
      <input
        type="date"
        value={date}
        max={today}
        aria-label="Jump to date"
        onChange={(e) => e.target.value && go(e.target.value)}
        className="tabular h-9 rounded-lg border border-line bg-raised px-2 text-sm outline-none
                   transition focus:border-brand focus:ring-2 focus:ring-brand/25"
      />
      {!isToday && (
        <button
          type="button"
          onClick={() => go(today)}
          className="h-9 shrink-0 rounded-lg bg-brand-soft px-3 text-sm font-medium text-brand
                     transition hover:brightness-95 active:scale-[0.98]"
        >
          Today
        </button>
      )}
    </div>
  );
}
