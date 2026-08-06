import { createClient } from "@/lib/supabase/server";
import { canEdit, getCurrentProfile, isAdmin } from "@/lib/auth";
import { todayKey } from "@/lib/tz";
import type {
  Company,
  Host,
  ReportRun,
  ReportSettings,
  ValidationType,
  Visit,
} from "@/lib/types";
import { TodayBoard } from "./today-board";

// This page depends on "today" and on data that changes constantly - never cache it.
export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const today = todayKey();

  const [visitsRes, typesRes, hostsRes, companiesRes, settingsRes, runsRes] =
    await Promise.all([
    supabase
      .from("visits")
      .select("*")
      .eq("visit_date", today)
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
    supabase.from("report_settings").select("*").eq("id", true).single(),
    // Newest first, so the card can show the most recent attempt per kind.
    supabase
      .from("report_runs")
      .select("*")
      .eq("report_date", today)
      .order("created_at", { ascending: false }),
  ]);

  const loadError =
    visitsRes.error ??
    typesRes.error ??
    hostsRes.error ??
    companiesRes.error ??
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

  return (
    <TodayBoard
      today={today}
      visits={(visitsRes.data ?? []) as Visit[]}
      validationTypes={(typesRes.data ?? []) as ValidationType[]}
      hosts={(hostsRes.data ?? []) as Host[]}
      companies={(companiesRes.data ?? []) as Company[]}
      settings={settingsRes.data as ReportSettings}
      runs={(runsRes.data ?? []) as ReportRun[]}
      editable={canEdit(profile)}
      isAdmin={isAdmin(profile)}
    />
  );
}
