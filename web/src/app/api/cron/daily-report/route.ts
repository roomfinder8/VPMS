import { createAdminClient } from "@/lib/supabase/admin";
import { isoDayOfWeek, nowHHmm, todayKey } from "@/lib/tz";
import { sendReport } from "@/lib/report/send-report";
import type { ReportSettings } from "@/lib/types";

// nodemailer and exceljs both need Node APIs.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Outcome {
  status: "sent" | "skipped" | "failed";
  reason?: string;
  date: string;
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

/**
 * The scheduled job.
 *
 * Deliberately safe to call more often than it needs to fire: the schedule can
 * run every quarter hour and this decides whether today's report is actually
 * due. That way the send time lives in the database and can be changed from
 * Settings without touching the cron entry, and a run missed while the server
 * was down still goes out on the next tick instead of being lost.
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
  const date = url.searchParams.get("date") ?? todayKey();
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

  const skip = async (reason: string): Promise<Response> => {
    await admin.from("report_runs").insert({
      report_date: date,
      kind: "draft",
      status: "skipped",
      recipients: settings.draft_recipients,
      error: reason,
    });
    return Response.json({ status: "skipped", reason, date } satisfies Outcome);
  };

  if (!force) {
    if (!settings.auto_send_enabled) {
      return Response.json({
        status: "skipped",
        reason: "automatic sending is switched off",
        date,
      } satisfies Outcome);
    }

    if (!settings.send_days.includes(isoDayOfWeek(date))) {
      return Response.json({
        status: "skipped",
        reason: "not a scheduled send day",
        date,
      } satisfies Outcome);
    }

    // send_time is 'HH:MM:SS'; compare on HH:mm in Thailand time
    if (nowHHmm() < settings.send_time.slice(0, 5)) {
      return Response.json({
        status: "skipped",
        reason: `before the send time (${settings.send_time.slice(0, 5)})`,
        date,
      } satisfies Outcome);
    }

    const { data: already } = await admin
      .from("report_runs")
      .select("id")
      .eq("report_date", date)
      .eq("status", "sent")
      .limit(1);

    if (already && already.length > 0) {
      return Response.json({
        status: "skipped",
        reason: "today's report has already been sent",
        date,
      } satisfies Outcome);
    }
  }

  if (settings.draft_recipients.length === 0) {
    return skip("no recipient configured");
  }

  // Close anything still open before the numbers are frozen into the report.
  let closedRows = 0;
  if (settings.auto_close_open_visits) {
    const { data, error } = await admin.rpc("close_open_visits", {
      p_date: date,
    });
    if (error) {
      console.error("[cron] close_open_visits failed", error);
    } else {
      closedRows = (data as number) ?? 0;
    }
  }

  try {
    const result = await sendReport({
      supabase: admin,
      from: date,
      to: date,
      recipients: settings.draft_recipients,
      appUrl: process.env.NEXT_PUBLIC_APP_URL,
    });

    await admin.from("report_runs").insert({
      report_date: date,
      kind: "draft",
      status: "sent",
      recipients: settings.draft_recipients,
      visit_count: result.visitCount,
      open_count: result.openCount,
    });

    return Response.json({
      status: "sent",
      date,
      visitCount: result.visitCount,
      openCount: result.openCount,
      closedRows,
      recipients: settings.draft_recipients,
    } satisfies Outcome);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron] send failed", err);

    await admin.from("report_runs").insert({
      report_date: date,
      kind: "draft",
      status: "failed",
      recipients: settings.draft_recipients,
      error: message,
    });

    return Response.json(
      { status: "failed", reason: message, date, closedRows } satisfies Outcome,
      { status: 500 },
    );
  }
}
