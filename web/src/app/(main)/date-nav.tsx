"use client";

import { useTransition } from "react";
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
 *
 * Wrapped in useTransition so a click gets an immediate visual response (the
 * controls dim, the date header shows a spinner) instead of the page looking
 * frozen for however long the server round trip takes - and so the buttons
 * are disabled while a navigation is already in flight rather than letting a
 * second click queue up behind it.
 */
export function DateNav({ date, today }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isToday = date === today;
  const canGoForward = date < today;

  function go(next: string) {
    startTransition(() => {
      router.push(next === today ? "/" : `/?date=${next}`);
    });
  }

  return (
    <div
      className={`flex items-center gap-1.5 transition-opacity ${isPending ? "opacity-60" : ""}`}
    >
      <button
        type="button"
        aria-label="Previous day"
        disabled={isPending}
        onClick={() => go(addDays(date, -1))}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line
                   text-ink-soft transition hover:bg-surface active:scale-[0.98]
                   disabled:pointer-events-none"
      >
        ‹
      </button>
      <button
        type="button"
        aria-label="Next day"
        disabled={isPending || !canGoForward}
        onClick={() => go(addDays(date, 1))}
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
        disabled={isPending}
        aria-label="Jump to date"
        onChange={(e) => e.target.value && go(e.target.value)}
        className="tabular h-9 rounded-lg border border-line bg-raised px-2 text-sm outline-none
                   transition focus:border-brand focus:ring-2 focus:ring-brand/25
                   disabled:pointer-events-none"
      />
      {!isToday && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => go(today)}
          className="h-9 shrink-0 rounded-lg bg-brand-soft px-3 text-sm font-medium text-brand
                     transition hover:brightness-95 active:scale-[0.98]
                     disabled:pointer-events-none"
        >
          Today
        </button>
      )}
      {isPending && (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2
                     border-ink-faint border-t-transparent"
        />
      )}
    </div>
  );
}
