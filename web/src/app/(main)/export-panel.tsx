"use client";

import { useEffect, useState } from "react";
import {
  addDays,
  dateRangeLabel,
  daysBetween,
  startOfMonth,
  startOfWeek,
} from "@/lib/tz";

interface Preset {
  label: string;
  range: (today: string) => { from: string; to: string };
}

const PRESETS: Preset[] = [
  { label: "Today", range: (t) => ({ from: t, to: t }) },
  {
    label: "Yesterday",
    range: (t) => ({ from: addDays(t, -1), to: addDays(t, -1) }),
  },
  { label: "This week", range: (t) => ({ from: startOfWeek(t), to: t }) },
  { label: "This month", range: (t) => ({ from: startOfMonth(t), to: t }) },
  {
    label: "Last month",
    range: (t) => {
      const endOfLast = addDays(startOfMonth(t), -1);
      return { from: startOfMonth(endOfLast), to: endOfLast };
    },
  },
  {
    label: "Last 30 days",
    range: (t) => ({ from: addDays(t, -29), to: t }),
  },
];

const MAX_DAYS = 366;

const inputClass =
  "h-11 w-full rounded-xl border border-line bg-raised px-3 text-base outline-none " +
  "transition focus:border-brand focus:ring-2 focus:ring-brand/25 tabular";

export function ExportPanel({ today }: { today: string }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const reversed = from > to;
  const span = reversed ? 0 : daysBetween(from, to);
  const tooLong = span > MAX_DAYS;
  const valid = !reversed && !tooLong;

  const href = `/api/export/visits?from=${from}&to=${to}`;
  const activePreset = PRESETS.find((p) => {
    const r = p.range(today);
    return r.from === from && r.to === to;
  })?.label;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 items-center rounded-xl border border-line bg-raised px-3
                   text-sm font-medium text-ink-soft transition hover:bg-surface
                   active:scale-[0.98]"
      >
        Export Excel
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Export to Excel"
            className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-raised
                       sm:max-w-md sm:rounded-2xl sm:shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="font-semibold">Export to Excel</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-1 text-sm text-ink-soft hover:bg-surface"
              >
                Close
              </button>
            </div>

            <div className="flex flex-col gap-4 p-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-ink-soft">Quick ranges</span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {PRESETS.map((preset) => {
                    const active = activePreset === preset.label;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          const r = preset.range(today);
                          setFrom(r.from);
                          setTo(r.to);
                        }}
                        className={`h-10 rounded-lg border text-sm transition active:scale-[0.98]
                                    ${
                                      active
                                        ? "border-brand bg-brand-soft font-medium text-brand"
                                        : "border-line text-ink-soft hover:bg-surface"
                                    }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm text-ink-soft">From</span>
                  <input
                    type="date"
                    value={from}
                    max={to}
                    onChange={(e) => setFrom(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm text-ink-soft">To</span>
                  <input
                    type="date"
                    value={to}
                    min={from}
                    onChange={(e) => setTo(e.target.value)}
                    className={inputClass}
                  />
                </label>
              </div>

              <p className="text-sm text-ink-faint">
                {reversed
                  ? "The start date is after the end date."
                  : tooLong
                    ? `That is ${span} days — pick ${MAX_DAYS} days or fewer.`
                    : `${dateRangeLabel(from, to)} · ${span} day${span === 1 ? "" : "s"}`}
              </p>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-12 flex-1 rounded-xl border border-line font-medium text-ink-soft
                             transition hover:bg-surface"
                >
                  Cancel
                </button>

                {/* A plain link so the browser handles the download and the
                    Content-Disposition filename with no extra code. */}
                <a
                  href={valid ? href : undefined}
                  aria-disabled={!valid}
                  onClick={() => {
                    if (valid) setOpen(false);
                  }}
                  className={`flex h-12 flex-[2] items-center justify-center rounded-xl
                              font-medium text-white transition
                              ${
                                valid
                                  ? "bg-brand hover:brightness-110 active:scale-[0.98]"
                                  : "pointer-events-none bg-brand/40"
                              }`}
                >
                  Download
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
