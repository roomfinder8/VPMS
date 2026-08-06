import "server-only";

import { sendMail } from "@/lib/mail/send";
import { buildReportEmail, reportFilename } from "./email";
import { fetchReportRows } from "./fetch";
import { buildWorkbook } from "./workbook";
import type { ReportRow } from "./types";

// Structural type so this works with both the cookie-bound server client and
// the service-role client the scheduled job uses.
type QueryableClient = Parameters<typeof fetchReportRows>[0];

export interface SendReportArgs {
  supabase: QueryableClient;
  from: string;
  to: string;
  recipients: string[];
  replyTo?: string;
  senderName?: string;
  appUrl?: string;
}

export interface SendReportResult {
  visitCount: number;
  /** Rows with no exit time recorded - repeated into report_runs so it is answerable later */
  openCount: number;
  messageId: string;
  rows: ReportRow[];
}

/**
 * Builds the workbook and the message, then sends the daily report.
 *
 * Throws on failure so the caller can record why in report_runs; swallowing the
 * error here would leave a run that looks successful but never arrived.
 */
export async function sendReport(
  args: SendReportArgs,
): Promise<SendReportResult> {
  const { supabase, from, to, recipients, replyTo, senderName, appUrl } = args;

  if (recipients.length === 0) {
    throw new Error("No recipient configured — add one in Settings");
  }

  const rows = await fetchReportRows(supabase, from, to);

  const workbook = buildWorkbook({ from, to }, rows);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

  const email = buildReportEmail({ from, to, rows, appUrl, senderName });

  const messageId = await sendMail({
    to: recipients,
    replyTo,
    subject: email.subject,
    html: email.html,
    text: email.text,
    attachments: [
      {
        filename: reportFilename(from, to),
        content: buffer,
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    ],
  });

  return {
    visitCount: rows.length,
    openCount: rows.filter(
      (r) => r.status === "in" || r.status === "no_checkout",
    ).length,
    messageId,
    rows,
  };
}
