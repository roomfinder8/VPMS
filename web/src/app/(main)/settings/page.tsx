import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile, isAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ReportSettings } from "@/lib/types";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const profile = await getCurrentProfile();
  if (!isAdmin(profile)) redirect("/");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("report_settings")
    .select("*")
    .eq("id", true)
    .single();

  if (error || !data) {
    console.error("[settings] load failed", error);
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800
                      dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
        <p className="font-medium">Could not load the settings</p>
        <p className="mt-1 opacity-80">{error?.message}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href="/"
          className="text-sm text-ink-faint underline underline-offset-2"
        >
          ← Back to today
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">
          Report settings
        </h1>
      </div>

      <SettingsForm settings={data as ReportSettings} />
    </div>
  );
}
