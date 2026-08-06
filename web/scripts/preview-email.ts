/**
 * Renders the report email to an HTML file so the layout can be looked at
 * without sending anything to anybody.
 *
 *   npx tsx scripts/preview-email.ts [outputPath]
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { buildReportEmail } from "../src/lib/report/email";
import { sampleRows } from "./sample-rows";

const DATE = "2026-08-06";

async function main() {
  const out = process.argv[2] ?? path.join(process.cwd(), "VPMS-email.html");

  const email = buildReportEmail({
    from: DATE,
    to: DATE,
    rows: sampleRows(DATE),
    appUrl: "https://vpms.example.com",
  });

  // Wrapped so it opens sensibly in a browser; the real message body is
  // exactly email.html.
  const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${email.subject}</title></head>
<body style="margin:0;padding:24px;background:#f5f6f8;">
  <div style="max-width:660px;margin:0 auto 16px;font-family:monospace;font-size:13px;color:#555;">
    <strong>Subject:</strong> ${email.subject}
  </div>
  <div style="max-width:660px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px;">
    ${email.html}
  </div>
</body></html>`;

  await writeFile(out, page, "utf8");
  console.log(`wrote ${out}`);
  console.log(`\nsubject: ${email.subject}\n`);
  console.log("--- plain text part ---");
  console.log(email.text);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
