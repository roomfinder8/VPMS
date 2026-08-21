import { dateRangeLabel, weekdayName } from "@/lib/tz";
import { toNumber } from "@/lib/types";
import type { ReportRow } from "./types";

export interface EmailInput {
  from: string;
  to: string;
  rows: ReportRow[];
  /** Link back into the app, so anything wrong can be fixed before forwarding */
  appUrl?: string;
  /** Set when a person pressed the button rather than the schedule firing */
  senderName?: string;
}

export interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

const INK = "#1f2430";
const MUTED = "#6b7280";
const LINE = "#e3e5ea";
const WARN = "#b45309";
const BRAND = "#1f3b63";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface Tally {
  label: string;
  visits: number;
  people: number;
}

function tallyByValidation(rows: ReportRow[]): Tally[] {
  const map = new Map<string, Tally>();
  for (const row of rows) {
    const current = map.get(row.validation_label) ?? {
      label: row.validation_label,
      visits: 0,
      people: 0,
    };
    current.visits += 1;
    current.people += row.visitor_count;
    map.set(row.validation_label, current);
  }
  return [...map.values()].sort((a, b) => b.visits - a.visits);
}

interface Attention {
  label: string;
  count: number;
}

function attentionItems(rows: ReportRow[]): Attention[] {
  return [
    {
      label: "still marked as in the building",
      count: rows.filter((r) => r.status === "in").length,
    },
    {
      label: "exit time estimated from the free hours",
      count: rows.filter((r) => r.status === "estimated").length,
    },
    {
      label: "no exit time recorded at all",
      count: rows.filter((r) => r.status === "no_checkout").length,
    },
    {
      label: "awaiting approval",
      count: rows.filter((r) => r.approval_status === "awaiting").length,
    },
    {
      label: "with no approver set",
      count: rows.filter((r) => r.approval_status === "no_approver").length,
    },
  ].filter((i) => i.count > 0);
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * The one email the system sends, to the person who reviews the day.
 *
 * It has to be readable on its own: she should be able to see how many
 * visitors, on whose account, and whether anything is missing, without opening
 * the attachment - then write her own message onward from there. The system
 * never emails the manager itself.
 */
export function buildReportEmail(input: EmailInput): BuiltEmail {
  const { from, to, rows, appUrl, senderName } = input;

  const singleDay = from === to;
  const period = dateRangeLabel(from, to);
  const heading = singleDay
    ? `${weekdayName(`${from}T12:00:00+07:00`)} ${period}`
    : period;

  const people = rows.reduce((sum, r) => sum + r.visitor_count, 0);
  const byValidation = tallyByValidation(rows);
  const attention = attentionItems(rows);

  const subject =
    `Visitor parking report — ${period} (${plural(rows.length, "visit", "visits")})`;

  // ----- plain text -------------------------------------------------------
  const textLines: string[] = [
    `ETTP Unit · ${heading}`,
    "",
    `Visits: ${rows.length}`,
    `People: ${people}`,
    "",
  ];

  if (byValidation.length) {
    textLines.push("By validation:");
    for (const t of byValidation) {
      textLines.push(
        `  - ${t.label}: ${plural(t.visits, "visit", "visits")}, ${plural(t.people, "person", "people")}`,
      );
    }
    textLines.push("");
  }

  if (attention.length) {
    textLines.push("Needs attention:");
    for (const a of attention) {
      textLines.push(`  - ${a.count} ${a.label}`);
    }
    textLines.push("");
  }

  if (appUrl) {
    textLines.push(`Review or correct anything here: ${appUrl}`);
    textLines.push("");
  }

  textLines.push("The full list is attached as an Excel file.");
  if (senderName) textLines.push(`Sent by ${senderName}.`);

  // ----- html -------------------------------------------------------------
  const rowsHtml = byValidation
    .map(
      (t) => `
        <tr>
          <td style="padding:6px 10px;border-bottom:1px solid ${LINE};">${escapeHtml(t.label)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid ${LINE};text-align:center;">${t.visits}</td>
          <td style="padding:6px 10px;border-bottom:1px solid ${LINE};text-align:center;">${t.people}</td>
        </tr>`,
    )
    .join("");

  const attentionHtml = attention.length
    ? `
      <div style="margin-top:20px;padding:12px 14px;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;">
        <div style="font-weight:600;color:${WARN};margin-bottom:6px;">Needs attention</div>
        <ul style="margin:0;padding-left:18px;color:${WARN};">
          ${attention.map((a) => `<li>${a.count} ${escapeHtml(a.label)}</li>`).join("")}
        </ul>
      </div>`
    : "";

  const cta = appUrl
    ? `<div style="margin-top:22px;">
         <a href="${escapeHtml(appUrl)}"
            style="display:inline-block;padding:10px 18px;background:${BRAND};color:#ffffff;
                   text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">
           Open in the app
         </a>
       </div>`
    : "";

  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
            color:${INK};max-width:620px;margin:0 auto;padding:8px;">
  <div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:${MUTED};">
    Visitor Parking Management · ETTP Unit
  </div>
  <h1 style="margin:6px 0 2px;font-size:20px;">${escapeHtml(heading)}</h1>
  <div style="color:${MUTED};font-size:14px;margin-bottom:18px;">
    ${plural(rows.length, "visit", "visits")} · ${plural(people, "person", "people")}
  </div>

  <div style="padding:10px 14px;background:#eef4ff;border:1px solid #c7dbff;border-radius:8px;color:${BRAND};font-size:14px;">
    This went to you only — nobody else has received it.
  </div>

  ${
    byValidation.length
      ? `<table cellpadding="0" cellspacing="0" style="width:100%;margin-top:20px;border-collapse:collapse;font-size:14px;">
           <thead>
             <tr style="background:${BRAND};color:#ffffff;">
               <th style="padding:8px 10px;text-align:left;">Validation</th>
               <th style="padding:8px 10px;text-align:center;">Visits</th>
               <th style="padding:8px 10px;text-align:center;">People</th>
             </tr>
           </thead>
           <tbody>${rowsHtml}</tbody>
         </table>`
      : `<p style="color:${MUTED};font-size:14px;">No visitors were logged in this period.</p>`
  }

  ${attentionHtml}
  ${cta}

  <p style="margin-top:24px;color:${MUTED};font-size:13px;">
    The full list is attached as an Excel file.${senderName ? ` Sent by ${escapeHtml(senderName)}.` : ""}
  </p>
</div>`.trim();

  return { subject, html, text: textLines.join("\n") };
}

/** Matches the filename the export endpoint uses */
export function reportFilename(from: string, to: string): string {
  const suffix = from === to ? from : `${from}_to_${to}`;
  return `VPMS-ETTP-visitors-${suffix}.xlsx`;
}

/**
 * The "Open in the app" link for a report email - the specific day's detail
 * page, not just the app root (which is the calendar dashboard, not
 * anywhere a reviewer could fix a row from). Returns undefined when
 * NEXT_PUBLIC_APP_URL isn't set, matching how the rest of the email already
 * treats a missing appUrl as "omit the link".
 */
export function dayUrl(date: string): string | undefined {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!base) return undefined;
  return `${base.replace(/\/+$/, "")}/day?date=${date}`;
}

export function reportValueTotal(rows: ReportRow[]): number {
  return rows.reduce((sum, r) => sum + (toNumber(r.value_baht) ?? 0), 0);
}
