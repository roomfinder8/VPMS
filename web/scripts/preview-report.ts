/**
 * Builds a sample daily workbook and writes it to disk, then reads it back and
 * prints what landed in each sheet.
 *
 * The point is to be able to check the report layout - and that the file is a
 * valid xlsx at all - without signing in, seeding the database, or clicking
 * through the app.
 *
 *   npx tsx scripts/preview-report.ts [outputPath]
 *
 * Set PREVIEW_FROM / PREVIEW_TO to preview the multi-day layout.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { addDays, daysBetween } from "../src/lib/tz";
import { buildWorkbook } from "../src/lib/report/workbook";
import { sampleRows } from "./sample-rows";

const DATE = "2026-08-06";

async function main() {
  const out =
    process.argv[2] ?? path.join(process.cwd(), `VPMS-sample-${DATE}.xlsx`);

  const from = process.env.PREVIEW_FROM ?? DATE;
  const to = process.env.PREVIEW_TO ?? DATE;

  const rows = sampleRows(from);

  // Spread the sample rows over the range so the "By day" section has
  // something to group.
  const span = daysBetween(from, to);
  const spread =
    span === 1
      ? rows
      : rows.map((r, i) => ({ ...r, visit_date: addDays(from, i % span) }));

  const buffer = await buildWorkbook({ from, to }, spread).xlsx.writeBuffer();
  await writeFile(out, Buffer.from(buffer));
  console.log(`wrote ${out} (${Buffer.from(buffer).length} bytes)\n`);

  // Read it back with a fresh parser - if the file were malformed this throws.
  const check = new ExcelJS.Workbook();
  await check.xlsx.readFile(out);

  for (const sheet of check.worksheets) {
    console.log(`--- ${sheet.name} (${sheet.rowCount} rows) ---`);
    sheet.eachRow({ includeEmpty: false }, (r, n) => {
      const cells: string[] = [];
      r.eachCell({ includeEmpty: false }, (cell) => {
        cells.push(String(cell.value ?? "").trim());
      });
      if (cells.length) console.log(String(n).padStart(3), cells.join(" | "));
    });
    console.log();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
