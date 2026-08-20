import { createClient } from "@/lib/supabase/server";
import { todayKey } from "@/lib/tz";
import type { ReportRun, Visit } from "@/lib/types";
import { TodayBoard } from "./today-board";

// This page depends on the selected date and on data that changes constantly - never cache it.
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function TodayPage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const today = todayKey();

  // A future date has nothing to show and would only come from a mistyped
  // URL, so it silently falls back to today rather than rendering an empty
  // "future" page.
  const requested = typeof params.date === "string" ? params.date : today;
  const date = DATE_RE.test(requested) && requested <= today ? requested : today;

  const supabase = await createClient();

  // Only the two queries that actually depend on `date` live here - see
  // (main)/layout.tsx for everything else, which does not need to be
  // re-fetched every time the viewed day changes.
  const [visitsRes, runsRes] = await Promise.all([
    supabase
      .from("visits")
      .select("*")
      .eq("visit_date", date)
      .order("check_in_at", { ascending: false }),
    // Newest first, so the card can show the most recent attempt per kind.
    supabase
      .from("report_runs")
      .select("*")
      .eq("report_date", date)
      .order("created_at", { ascending: false }),
  ]);

  const loadError = visitsRes.error ?? runsRes.error;

  if (loadError) {
    console.error("[today] load failed", loadError);
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800
                      dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
        <p className="font-medium">Could not load data</p>
        <p className="mt-1 opacity-80">{loadError.message}</p>
      </div>
    );
  }

  return (
    <TodayBoard
      date={date}
      today={today}
      visits={(visitsRes.data ?? []) as Visit[]}
      runs={(runsRes.data ?? []) as ReportRun[]}
    />
  );
}
