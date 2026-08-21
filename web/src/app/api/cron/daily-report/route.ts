import { createAdminClient } from "@/lib/supabase/admin";
import {
  addDays,
  addMonths,
  isoDayOfWeek,
  nowHHmm,
  startOfMonth,
  todayKey,
} from "@/lib/tz";
import { reportAppUrl } from "@/lib/report/email";
import { sendReport } from "@/lib/report/send-report";
import type { ReportSettings } from "@/lib/types";

// nodemailer and exceljs both need Node APIs.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Outcome {
  status: "sent" | "skipped" | "failed";
  reason?: string;
  from: string;
  to: string;
  visitCount?: number;
  openCount?: number;
  closedRows?: number;
  recipients?: string[];
}

function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * Constant-time-ish comparison. Not critical here, but the secret is the only
 * thing standing between the internet and a mail send.
 */
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}

/** Every day from `from` to `to`, inclusive - small ranges only (a month, at most). */
function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}

/**
 * The scheduled job.
 *
 * Deliberately safe to call more often than it needs to fire: the schedule can
 * run every quarter hour and this decides whether a report is actually due -
 * daily (a single day) or monthly (the previous calendar month), per
 * `report_settings.frequency`. That way the schedule lives in the database and
 * can be changed from Settings without touching the cron entry, and a run
 * missed while the server was down still goes out on the next tick instead of
 * being lost.
 *
 * It only ever emails the reviewer. Nothing here reaches the manager - that
 * message is written by a person.
 */
async function handle(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return Response.json(
      { error: "CRON_SECRET is not set on the server" },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const header = request.headers.get("authorization");
  const provided = header?.startsWith("Bearer ")
    ? header.slice(7)
    : url.searchParams.get("secret");

  if (!secretMatches(provided, expected)) return unauthorized();

  const force = url.searchParams.get("force") === "1";
  // Lets a specific date be simulated for testing; otherwise the real today.
  const today = url.searchParams.get("date") ?? todayKey();
  const admin = createAdminClient();

  const { data: settingsRow, error: settingsError } = await admin
    .from("report_settings")
    .select("*")
    .eq("id", true)
    .single();

  if (settingsError || !settingsRow) {
    return Response.json(
      { error: `Could not read report settings: ${settingsError?.message}` },
      { status: 500 },
    );
  }
  const settings = settingsRow as ReportSettings;

  // Housekeeping: close whatever was left open yesterday, every tick,
  // independent of whether a report actually fires today. On a daily
  // schedule this is redundant with the close-before-sending step below; on
  // a monthly one it is the only thing keeping the board looking sane for
  // the weeks between reports, rather than open visits sitting indefinitely
  // until month-end. Cheap - a no-op when nothing is open.
  if (settings.auto_close_open_visits) {
    const { error } = await admin.rpc("close_open_visits", {
      p_date: addDays(today, -1),
    });
    if (error) console.error("[cron] yesterday housekeeping failed", error);
  }

  // The period this run's report would cover, and the key used to detect a
  // duplicate send: `from` (a single day for daily, the 1st of the covered
  // month for monthly - unique per real month either way).
  const from =
    settings.frequency === "monthly"
      ? addMonths(startOfMonth(today), -1)
      : today;
  const to =
    settings.frequency === "monthly" ? addDays(startOfMonth(today), -1) : today;

  const skip = async (reason: string): Promise<Response> => {
    await admin.from("report_runs").insert({
      report_date: from,
      kind: "draft",
      status: "skipped",
      recipients: settings.draft_recipients,
      error: reason,
    });
    return Response.json({ status: "skipped", reason, from, to } satisfies Outcome);
  };

  if (!force) {
    if (!settings.auto_send_enabled) {
      return Response.json({
        status: "skipped",
        reason: "automatic sending is switched off",
        from,
        to,
      } satisfies Outcome);
    }

    if (settings.frequency === "monthly") {
      if (Number(today.slice(8, 10)) !== settings.send_day_of_month) {
        return Response.json({
          status: "skipped",
          reason: `not the scheduled day of the month (day ${settings.send_day_of_month})`,
          from,
          to,
        } satisfies Outcome);
      }
    } else if (!settings.send_days.includes(isoDayOfWeek(today))) {
      return Response.json({
        status: "skipped",
        reason: "not a scheduled send day",
        from,
        to,
      } satisfies Outcome);
    }

    // send_time is 'HH:MM:SS'; compare on HH:mm in Thailand time
    if (nowHHmm() < settings.send_time.slice(0, 5)) {
      return Response.json({
        status: "skipped",
        reason: `before the send time (${settings.send_time.slice(0, 5)})`,
        from,
        to,
      } satisfies Outcome);
    }

    // Only a previous *scheduled* run counts as "already sent".
    //
    // triggered_by is null exactly when the schedule sent it; a person pressing
    // Send now stamps their own id. Counting manual sends here would mean that
    // asking for the numbers by hand silently cancels the real scheduled
    // report, and nobody would notice until it never arrived.
    const { data: already } = await admin
      .from("report_runs")
      .select("id")
      .eq("report_date", from)
      .eq("status", "sent")
      .is("triggered_by", null)
      .limit(1);

    if (already && already.length > 0) {
      return skip("the scheduled report for this period has already been sent");
    }
  }

  if (settings.draft_recipients.length === 0) {
    return skip("no recipient configured");
  }

  // Close anything still open across the report's own coverage before the
  // numbers are frozen in. For daily this is one day; for monthly, every day
  // in the month gets a pass, though by send time the yesterday-housekeeping
  // above will usually have already closed all of it - this is the final
  // sweep, not the primary mechanism.
  let closedRows = 0;
  if (settings.auto_close_open_visits) {
    for (const day of eachDay(from, to)) {
      const { data, error } = await admin.rpc("close_open_visits", {
        p_date: day,
      });
      if (error) {
        console.error("[cron] close_open_visits failed", day, error);
      } else {
        closedRows += (data as number) ?? 0;
      }
    }
  }

  try {
    const result = await sendReport({
      supabase: admin,
      from,
      to,
      recipients: settings.draft_recipients,
      appUrl: reportAppUrl(from, to),
    });

    await admin.from("report_runs").insert({
      report_date: from,
      kind: "draft",
      status: "sent",
      recipients: settings.draft_recipients,
      visit_count: result.visitCount,
      open_count: result.openCount,
    });

    return Response.json({
      status: "sent",
      from,
      to,
      visitCount: result.visitCount,
      openCount: result.openCount,
      closedRows,
      recipients: settings.draft_recipients,
    } satisfies Outcome);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron] send failed", err);

    await admin.from("report_runs").insert({
      report_date: from,
      kind: "draft",
      status: "failed",
      recipients: settings.draft_recipients,
      error: message,
    });

    return Response.json(
      { status: "failed", reason: message, from, to, closedRows } satisfies Outcome,
      { status: 500 },
    );
  }
}
