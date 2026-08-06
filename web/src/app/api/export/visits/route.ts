import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { daysBetween, todayKey } from "@/lib/tz";
import { buildWorkbook } from "@/lib/report/workbook";
import { REPORT_COLUMNS, type ReportRow } from "@/lib/report/types";

// exceljs needs Node APIs, so this cannot run on the edge runtime.
export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A year is well past anything anyone reports on, and keeps one request from pulling the whole table. */
const MAX_DAYS = 366;

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return new Response("Unauthorized", { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  // `date` is accepted as a single-day shorthand for `from`.
  const from = params.get("from") ?? params.get("date") ?? todayKey();
  const to = params.get("to") ?? from;

  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return new Response("Invalid date, expected YYYY-MM-DD", { status: 400 });
  }
  if (from > to) {
    return new Response("The start date is after the end date", { status: 400 });
  }
  if (daysBetween(from, to) > MAX_DAYS) {
    return new Response(`Pick a range of ${MAX_DAYS} days or fewer`, {
      status: 400,
    });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("visits_report")
    .select(REPORT_COLUMNS)
    .gte("visit_date", from)
    .lte("visit_date", to)
    .order("check_in_at", { ascending: true });

  if (error) {
    console.error("[export] query failed", error);
    return new Response("Could not read the visits for that period", {
      status: 500,
    });
  }

  const workbook = buildWorkbook({ from, to }, (data ?? []) as unknown as ReportRow[]);
  const buffer = await workbook.xlsx.writeBuffer();

  const suffix = from === to ? from : `${from}_to_${to}`;

  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="VPMS-ETTP-visitors-${suffix}.xlsx"`,
      // The file reflects the moment it was asked for; never serve a stale copy.
      "Cache-Control": "no-store",
    },
  });
}
