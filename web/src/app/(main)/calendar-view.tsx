import Link from "next/link";
import { dateRangeLabel, monthLabel, weekdayName } from "@/lib/tz";
import { WEEKDAY_LABELS } from "@/lib/calendar";

export interface DaySummary {
  date: string;
  count: number;
  visitorNames: string[];
  /** true if any visit that day is not fully approved (awaiting or no approver set) */
  needsAttention: boolean;
}

interface Props {
  view: "week" | "month";
  /** 1st of the month (month view) or the Monday (week view) currently on screen */
  anchor: string;
  today: string;
  weeks: string[][];
  days: Map<string, DaySummary>;
  /** dates in the visible range with anything not fully approved, oldest first */
  attentionDates: string[];
  totalVisits: number;
  prevHref: string;
  nextHref: string;
}

const navLinkClass =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line " +
  "text-ink-soft transition hover:bg-surface active:scale-[0.98]";

/** 'Tue 4' - short enough for a chip, unambiguous within one week/month view */
function chipLabel(date: string): string {
  return `${weekdayName(`${date}T12:00:00+07:00`).slice(0, 3)} ${Number(date.slice(8, 10))}`;
}

function AttentionBanner({ dates }: { dates: string[] }) {
  if (dates.length === 0) return null;

  return (
    <div
      className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5
                 dark:border-amber-900 dark:bg-amber-950/40"
    >
      <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
        Needs approval ({dates.length} day{dates.length === 1 ? "" : "s"})
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {dates.map((date) => (
          <Link
            key={date}
            href={`/day?date=${date}`}
            className="tabular rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900
                       transition hover:bg-amber-200 dark:bg-amber-900/60 dark:text-amber-100
                       dark:hover:bg-amber-900"
          >
            {chipLabel(date)}
          </Link>
        ))}
      </div>
    </div>
  );
}

function ViewToggle({ view, anchor }: { view: "week" | "month"; anchor: string }) {
  const tab = (label: string, target: "week" | "month", href: string) => (
    <Link
      href={href}
      aria-current={view === target ? "page" : undefined}
      className={`h-8 rounded-md px-3 text-sm font-medium transition
                  ${
                    view === target
                      ? "bg-brand text-white"
                      : "text-ink-soft hover:bg-surface"
                  }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-line p-1">
      {tab("Week", "week", `/?view=week&date=${anchor}`)}
      {tab("Month", "month", `/?view=month&date=${anchor}`)}
    </div>
  );
}

function DayCell({
  date,
  today,
  inCurrentMonth,
  summary,
}: {
  date: string;
  today: string;
  inCurrentMonth: boolean;
  summary?: DaySummary;
}) {
  const isToday = date === today;
  const dayNum = Number(date.slice(8, 10));
  const count = summary?.count ?? 0;

  return (
    <Link
      href={`/day?date=${date}`}
      className={`flex h-11 flex-col items-center justify-center gap-0.5 rounded-lg
                  border text-center transition hover:border-brand hover:bg-brand-soft/40
                  sm:h-12
                  ${isToday ? "border-brand" : "border-line"}
                  ${inCurrentMonth ? "" : "opacity-40"}`}
    >
      <span className={`tabular text-xs ${isToday ? "font-semibold text-brand" : ""}`}>
        {dayNum}
      </span>
      {count > 0 && (
        <span className="tabular rounded-full bg-brand-soft px-1.5 text-[10px] font-medium text-brand">
          {count}
        </span>
      )}
    </Link>
  );
}

function MonthGrid({
  weeks,
  today,
  days,
  monthNum,
}: {
  weeks: string[][];
  today: string;
  days: Map<string, DaySummary>;
  monthNum: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-ink-faint">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label}>{label}</div>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={week[0]} className="grid grid-cols-7 gap-1">
          {week.map((date) => (
            <DayCell
              key={date}
              date={date}
              today={today}
              inCurrentMonth={date.slice(5, 7) === monthNum}
              summary={days.get(date)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function WeekList({
  week,
  today,
  days,
}: {
  week: string[];
  today: string;
  days: Map<string, DaySummary>;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {week.map((date) => {
        const summary = days.get(date);
        const isToday = date === today;
        const preview = summary?.visitorNames.slice(0, 3) ?? [];
        const extra = (summary?.count ?? 0) - preview.length;

        return (
          <li key={date}>
            <Link
              href={`/day?date=${date}`}
              className={`flex items-center gap-3 rounded-xl border bg-raised p-3 transition
                          hover:border-brand hover:bg-brand-soft/20
                          ${isToday ? "border-brand" : "border-line"}`}
            >
              <div className="flex w-14 shrink-0 flex-col items-center">
                <span className="text-xs text-ink-faint">{weekdayName(`${date}T12:00:00+07:00`).slice(0, 3)}</span>
                <span className={`tabular text-lg font-semibold ${isToday ? "text-brand" : ""}`}>
                  {Number(date.slice(8, 10))}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                {summary && summary.count > 0 ? (
                  <>
                    <p className="truncate text-sm">
                      {preview.join(", ")}
                      {extra > 0 && ` +${extra} more`}
                    </p>
                    <p className="text-xs text-ink-faint">
                      {summary.count} visit{summary.count === 1 ? "" : "s"}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-ink-faint">No visitors</p>
                )}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function CalendarView({
  view,
  anchor,
  today,
  weeks,
  days,
  attentionDates,
  totalVisits,
  prevHref,
  nextHref,
}: Props) {
  const label =
    view === "month" ? monthLabel(anchor) : dateRangeLabel(weeks[0][0], weeks[0][6]);
  const todayHref = view === "month" ? `/?view=month&date=${today.slice(0, 8)}01` : `/?view=week`;
  const isCurrentPeriod =
    view === "month" ? anchor.slice(0, 7) === today.slice(0, 7) : weeks[0].includes(today);

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-1.5">
          <Link href={prevHref} aria-label="Previous" className={navLinkClass}>
            ‹
          </Link>
          <Link href={nextHref} aria-label="Next" className={navLinkClass}>
            ›
          </Link>
          <h1 className="ml-1 flex-1 text-xl font-semibold tracking-tight">{label}</h1>
          {!isCurrentPeriod && (
            <Link
              href={todayHref}
              className="h-9 shrink-0 rounded-lg bg-brand-soft px-3 text-sm font-medium
                         leading-9 text-brand transition hover:brightness-95"
            >
              Today
            </Link>
          )}
        </div>

        {/* Its own row, always in the same place - inline with the arrows it
            ended up wrapping unpredictably on narrower screens. */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-ink-faint">
            <b className="tabular text-ink">{totalVisits}</b> visit{totalVisits === 1 ? "" : "s"} this{" "}
            {view}
          </span>
          <ViewToggle view={view} anchor={anchor} />
        </div>
      </section>

      <AttentionBanner dates={attentionDates} />

      {view === "month" ? (
        <MonthGrid weeks={weeks} today={today} days={days} monthNum={anchor.slice(5, 7)} />
      ) : (
        <WeekList week={weeks[0]} today={today} days={days} />
      )}

      <p className="text-center text-xs text-ink-faint">
        Tap a date to see the visits logged that day.
      </p>
    </div>
  );
}
