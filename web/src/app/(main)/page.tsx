import { createClient } from "@/lib/supabase/server";
import { monthGrid, weekDates } from "@/lib/calendar";
import { addDays, addMonths, startOfMonth, startOfWeek, todayKey } from "@/lib/tz";
import { approvalStatus } from "@/lib/types";
import { CalendarView, type DaySummary } from "./calendar-view";

// The visible range depends on which week/month is on screen - never cache it.
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(raw: unknown, fallback: string): string {
  return typeof raw === "string" && DATE_RE.test(raw) ? raw : fallback;
}

export default async function DashboardPage({
  searchParams,
}: PageProps<"/">) {
  const params = await searchParams;
  const today = todayKey();

  const view = params.view === "week" ? "week" : "month";
  // The anchor can be any date the visible week/month contains - navigation
  // always lands on the 1st (month) or the Monday (week) so the URL stays
  // predictable, but a stray value still resolves to something on screen
  // rather than erroring.
  const anchor = parseDate(params.date, today);

  const weeks = view === "month" ? monthGrid(anchor) : [weekDates(anchor)];
  const rangeFrom = weeks[0][0];
  const rangeTo = weeks[weeks.length - 1][6];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("visits")
    .select("visit_date, visitor_name, approver_name, approved_on")
    .gte("visit_date", rangeFrom)
    .lte("visit_date", rangeTo)
    .order("check_in_at", { ascending: true });

  if (error) {
    console.error("[dashboard] load failed", error);
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800
                      dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
        <p className="font-medium">Could not load data</p>
        <p className="mt-1 opacity-80">{error.message}</p>
      </div>
    );
  }

  const byDate = new Map<string, DaySummary>();
  for (const row of data ?? []) {
    const existing: DaySummary = byDate.get(row.visit_date) ?? {
      date: row.visit_date,
      count: 0,
      visitorNames: [],
      needsAttention: false,
    };
    existing.count += 1;
    existing.visitorNames.push(row.visitor_name);
    if (approvalStatus(row) !== "approved") existing.needsAttention = true;
    byDate.set(row.visit_date, existing);
  }

  // Anchor for "previous / next" links: the 1st of the month for month view,
  // the Monday of the week for week view, so paging never drifts to a
  // different day-of-month/week than where the visitor started. Derived from
  // `anchor` itself, not from the grid bounds, which can spill into the
  // adjacent month.
  const pagingAnchor = view === "month" ? startOfMonth(anchor) : startOfWeek(anchor);

  return (
    <CalendarView
      view={view}
      anchor={pagingAnchor}
      today={today}
      weeks={weeks}
      days={byDate}
      totalVisits={data?.length ?? 0}
      prevHref={
        view === "month"
          ? `/?view=month&date=${addMonths(pagingAnchor, -1)}`
          : `/?view=week&date=${addDays(pagingAnchor, -7)}`
      }
      nextHref={
        view === "month"
          ? `/?view=month&date=${addMonths(pagingAnchor, 1)}`
          : `/?view=week&date=${addDays(pagingAnchor, 7)}`
      }
    />
  );
}
