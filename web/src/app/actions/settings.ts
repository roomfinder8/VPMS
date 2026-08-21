"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile, isAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, ReportFrequency } from "@/lib/types";

export interface ReportSettingsInput {
  recipients: string;
  sendTime: string;
  frequency: ReportFrequency;
  sendDays: number[];
  sendDayOfMonth: number;
  autoSendEnabled: boolean;
  autoCloseOpenVisits: boolean;
}

// Deliberately loose: the job is to catch typos like a missing @ or a stray
// comma, not to adjudicate what RFC 5322 permits.
const EMAIL_RE = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function fail(error: string): ActionResult {
  return { ok: false, error };
}

/** Accepts addresses separated by commas, semicolons or new lines */
function parseAddresses(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function updateReportSettings(
  input: ReportSettingsInput,
): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!isAdmin(profile)) {
    return fail("Only an administrator can change these settings");
  }

  const recipients = parseAddresses(input.recipients);

  for (const address of recipients) {
    if (!EMAIL_RE.test(address)) {
      return fail(`"${address}" does not look like an email address`);
    }
  }

  if (!TIME_RE.test(input.sendTime)) {
    return fail("Send time must look like 17:30");
  }

  if (input.frequency !== "daily" && input.frequency !== "monthly") {
    return fail("Invalid frequency");
  }

  const days = [...new Set(input.sendDays)].sort((a, b) => a - b);
  if (days.some((d) => d < 1 || d > 7)) {
    return fail("Invalid day selection");
  }
  if (
    input.autoSendEnabled &&
    input.frequency === "daily" &&
    days.length === 0
  ) {
    return fail("Pick at least one day, or switch automatic sending off");
  }

  if (!Number.isInteger(input.sendDayOfMonth) || input.sendDayOfMonth < 1 || input.sendDayOfMonth > 28) {
    return fail("Day of month must be between 1 and 28");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("report_settings")
    .update({
      draft_recipients: recipients,
      send_time: input.sendTime,
      frequency: input.frequency,
      send_days: days,
      send_day_of_month: input.sendDayOfMonth,
      auto_send_enabled: input.autoSendEnabled,
      auto_close_open_visits: input.autoCloseOpenVisits,
    })
    .eq("id", true);

  if (error) {
    console.error("[settings] update failed", error);
    return fail("Could not save the settings");
  }

  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true };
}
