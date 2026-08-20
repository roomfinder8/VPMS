import { redirect } from "next/navigation";
import { canEdit, getCurrentProfile, isAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  distinctSorted,
  type Company,
  type Host,
  type ReportSettings,
  type ValidationType,
} from "@/lib/types";
import { SUGGESTED_VEHICLE_BRANDS } from "@/lib/vehicle-brands";
import { logout } from "../login/actions";
import { BoardDataProvider } from "./board-data-context";

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrator",
  user: "User",
};

export default async function MainLayout({ children }: LayoutProps<"/">) {
  const profile = await getCurrentProfile();
  // proxy.ts already guards this; the repeat check covers a session expiring mid-use.
  if (!profile) redirect("/login");

  const supabase = await createClient();

  // None of this depends on which day is on screen, so it lives here rather
  // than in page.tsx - Next.js does not re-run a layout just because the
  // page's searchParams changed, so switching days only waits on the two
  // queries that actually need to (visits, report_runs in page.tsx).
  const [typesRes, hostsRes, companiesRes, vehicleBrandsRes, approverNamesRes, settingsRes] =
    await Promise.all([
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
      // behind them (see the 0013 migration), so the autocomplete list is
      // built from what has actually been typed. Capped generously; if the
      // table grows large enough for this to matter, it should become a
      // proper distinct query or a small lookup table instead.
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
    ]);

  const loadError =
    typesRes.error ??
    hostsRes.error ??
    companiesRes.error ??
    vehicleBrandsRes.error ??
    approverNamesRes.error ??
    settingsRes.error;

  if (loadError || !settingsRes.data) {
    console.error("[layout] board data load failed", loadError);
    return (
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="max-w-md rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800
                        dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <p className="font-medium">Could not load the app</p>
          <p className="mt-1 opacity-80">{loadError?.message ?? "Report settings are missing."}</p>
        </div>
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
    <BoardDataProvider
      value={{
        validationTypes: (typesRes.data ?? []) as ValidationType[],
        hosts: (hostsRes.data ?? []) as Host[],
        companies: (companiesRes.data ?? []) as Company[],
        vehicleBrands,
        approverNames,
        settings: settingsRes.data as ReportSettings,
        editable: canEdit(profile),
        isAdmin: isAdmin(profile),
      }}
    >
      <div className="flex min-h-full flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-raised/85 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight">
                Visitor Parking Management
              </p>
              <p className="truncate text-xs text-ink-faint leading-tight">
                ETTP Unit
              </p>
            </div>

            <div className="hidden text-right sm:block">
              <p className="text-sm leading-tight">{profile.full_name}</p>
              <p className="text-xs text-ink-faint leading-tight">
                {ROLE_LABEL[profile.role] ?? profile.role}
              </p>
            </div>

            <form action={logout}>
              <button
                type="submit"
                className="h-10 rounded-lg border border-line px-3 text-sm text-ink-soft
                           transition hover:bg-surface active:scale-[0.98] sm:h-9"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-5 sm:pb-12">
          {children}
        </main>
      </div>
    </BoardDataProvider>
  );
}
