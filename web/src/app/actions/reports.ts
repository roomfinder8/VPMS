"use server";

import { revalidatePath } from "next/cache";
import { canEdit, getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dayUrl } from "@/lib/report/email";
import { sendReport } from "@/lib/report/send-report";
import type { ActionResult, ReportSettings } from "@/lib/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function fail(error: string): ActionResult {
  return { ok: false, error };
}

/**
 * Sends the daily report by hand, for when it is wanted before the scheduled
 * time - or again after fixing something.
 *
 * It goes to the same reviewer address the schedule uses. The system never
 * emails the manager: the reviewer writes that message herself, from her own
 * mailbox, once she is happy with the numbers.
 */
export async function sendReportNow(date: string): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!canEdit(profile) || !profile) {
    return fail("You do not have permission to send the report");
  }
  if (!DATE_RE.test(date)) return fail("Invalid date");

  const supabase = await createClient();

  const { data: settingsRow, error: settingsError } = await supabase
    .from("report_settings")
    .select("*")
    .eq("id", true)
    .single();

  if (settingsError || !settingsRow) {
    console.error("[reports] settings read failed", settingsError);
    return fail("Could not read the report settings");
  }
  const settings = settingsRow as ReportSettings;
  const recipients = settings.draft_recipients;

  if (recipients.length === 0) {
    return fail("No recipient is configured yet — add one in Settings");
  }

  try {
    const result = await sendReport({
      supabase,
      from: date,
      to: date,
      recipients,
      senderName: profile.full_name,
      appUrl: dayUrl(date),
    });

    await supabase.from("report_runs").insert({
      report_date: date,
      kind: "draft",
      status: "sent",
      recipients,
      visit_count: result.visitCount,
      open_count: result.openCount,
      triggered_by: profile.id,
    });

    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[reports] send failed", err);

    await supabase.from("report_runs").insert({
      report_date: date,
      kind: "draft",
      status: "failed",
      recipients,
      error: message,
      triggered_by: profile.id,
    });

    revalidatePath("/");
    return fail(message);
  }
}
