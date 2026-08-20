import { createClient } from "@/lib/supabase/server";
import { canEdit, getCurrentProfile, isAdmin } from "@/lib/auth";
import { todayKey } from "@/lib/tz";
import {
  distinctSorted,
  type Company,
  type Host,
  type ReportRun,
  type ReportSettings,
  type ValidationType,
  type Visit,
} from "@/lib/types";
import { SUGGESTED_VEHICLE_BRANDS } from "@/lib/vehicle-brands";
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
  const profile = await getCurrentProfile();

  const [
    visitsRes,
    typesRes,
    hostsRes,
    companiesRes,
    vehicleBrandsRes,
    approverNamesRes,
    settingsRes,
    runsRes,
  ] = await Promise.all([
    supabase
      .from("visits")
      .select("*")
      .eq("visit_date", date)
      .order("check_in_at", { ascending: false }),
    supabase
      .from("validation_types")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("hosts")
      .select("id, name, department, is_active, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    // Cap at 300 of the most frequent names - plenty for the datalist without
    // slowing the page down.
    supabase
      .from("companies")
      .select("id, name, visit_count")
      .order("visit_count", { ascending: false })
      .order("name", { ascending: true })
      .limit(300),
    // vehicle_brand and approver_name are free text with no lookup table
    // behind them (see the 0013 migration), so the autocomplete list is built
    // from what has actually been typed. Capped generously; if the table
    // grows large enough for this to matter, it should become a proper
    // distinct query or a small lookup table instead.
    supabase
      .from("visits")
      .select("vehicle_brand")
      .not("vehicle_brand", "is", null)
      .limit(2000),
    supabase
      .from("visits")
      .select("approver_name")
      .not("approver_name", "is", null)
      .limit(2000),
    supabase.from("report_settings").select("*").eq("id", true).single(),
    // Newest first, so the card can show the most recent attempt per kind.
    supabase
      .from("report_runs")
      .select("*")
      .eq("report_date", date)
      .order("created_at", { ascending: false }),
  ]);

  const loadError =
    visitsRes.error ??
    typesRes.error ??
    hostsRes.error ??
    companiesRes.error ??
    vehicleBrandsRes.error ??
    approverNamesRes.error ??
    settingsRes.error ??
    runsRes.error;

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

  const vehicleBrands = distinctSorted([
    ...SUGGESTED_VEHICLE_BRANDS,
    ...(vehicleBrandsRes.data ?? []).map((r) => r.vehicle_brand as string),
  ]);
  const approverNames = distinctSorted(
    (approverNamesRes.data ?? []).map((r) => r.approver_name as string),
  );

  return (
    <TodayBoard
      date={date}
      today={today}
      visits={(visitsRes.data ?? []) as Visit[]}
      validationTypes={(typesRes.data ?? []) as ValidationType[]}
      hosts={(hostsRes.data ?? []) as Host[]}
      companies={(companiesRes.data ?? []) as Company[]}
      vehicleBrands={vehicleBrands}
      approverNames={approverNames}
      settings={settingsRes.data as ReportSettings}
      runs={(runsRes.data ?? []) as ReportRun[]}
      editable={canEdit(profile)}
      isAdmin={isAdmin(profile)}
    />
  );
}
