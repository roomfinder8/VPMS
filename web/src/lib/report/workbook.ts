// Deliberately no "server-only" here: this module holds no secrets, and keeping
// it importable from a plain Node script is what makes the layout testable
// without standing up the whole app.
import ExcelJS from "exceljs";
import { dateRangeLabel, dateShort, weekdayName } from "@/lib/tz";
import { STATUS_LABEL, toNumber } from "@/lib/types";
import type { ReportRow } from "./types";

const TITLE = "Visitor Parking Management — ETTP Unit";

const INK = "FF1F2430";
const HEADER_FILL = "FF1F3B63";
const BAND = "FFF4F6F9";
const WARN = "FFB45309";
const LINE = "FFD8DCE3";

interface Column {
  header: string;
  width: number;
  value: (row: ReportRow, index: number) => string | number | null;
  align?: "left" | "center" | "right";
}

const COLUMNS: Column[] = [
  { header: "#", width: 5, align: "center", value: (_r, i) => i + 1 },
  { header: "Date", width: 12, align: "center", value: (r) => r.visit_date },
  { header: "Time in", width: 9, align: "center", value: (r) => r.time_in },
  { header: "Time out", width: 9, align: "center", value: (r) => r.time_out ?? "—" },
  { header: "Duration", width: 9, align: "center", value: (r) => r.duration_hhmm ?? "—" },
  { header: "Visitor", width: 26, value: (r) => r.visitor_name },
  { header: "People", width: 8, align: "center", value: (r) => r.visitor_count },
  { header: "Company", width: 30, value: (r) => r.company_name },
  { header: "Host", width: 20, value: (r) => r.host_name },
  { header: "Validation", width: 16, value: (r) => r.validation_label },
  {
    header: "Free hrs",
    width: 9,
    align: "center",
    value: (r) => toNumber(r.free_hours) ?? "—",
  },
  { header: "Card no.", width: 12, align: "center", value: (r) => r.parking_card_no ?? "" },
  { header: "Plate", width: 12, align: "center", value: (r) => r.license_plate ?? "" },
  { header: "Purpose / note", width: 30, value: (r) => r.purpose ?? r.remark ?? "" },
  { header: "Status", width: 14, align: "center", value: (r) => STATUS_LABEL[r.status] },
  { header: "Logged by", width: 16, value: (r) => r.created_by_name ?? "" },
];

function countBy<K>(rows: ReportRow[], key: (r: ReportRow) => K) {
  const map = new Map<K, { visits: number; people: number }>();
  for (const r of rows) {
    const current = map.get(key(r)) ?? { visits: 0, people: 0 };
    current.visits += 1;
    current.people += r.visitor_count;
    map.set(key(r), current);
  }
  return map;
}

/**
 * The daily workbook: one sheet of rows, one sheet of totals.
 *
 * The summary sheet is the one the manager actually reads - nobody reads the
 * raw table - so it leads with the counts and calls out anything that needs
 * the secretary's attention rather than burying it.
 */
export interface ReportRange {
  from: string;
  to: string;
}

export function buildWorkbook(range: ReportRange, rows: ReportRow[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "VPMS";
  wb.created = new Date();

  buildDetails(wb, range, rows);
  buildSummary(wb, range, rows);

  return wb;
}

/** 'Thursday 6 August 2026' for one day, '28 July – 6 August 2026' for a range */
function rangeHeading({ from, to }: ReportRange): string {
  const label = dateRangeLabel(from, to);
  return from === to
    ? `${weekdayName(`${from}T12:00:00+07:00`)} ${label}`
    : label;
}

function titleBlock(
  sheet: ExcelJS.Worksheet,
  range: ReportRange,
  subtitle: string,
  lastColumn: number,
) {
  sheet.mergeCells(1, 1, 1, lastColumn);
  const title = sheet.getCell(1, 1);
  title.value = TITLE;
  title.font = { bold: true, size: 14, color: { argb: INK } };

  sheet.mergeCells(2, 1, 2, lastColumn);
  const sub = sheet.getCell(2, 1);
  sub.value = `${rangeHeading(range)} · ${subtitle}`;
  sub.font = { size: 10, color: { argb: "FF6B7280" } };

  sheet.getRow(1).height = 20;
  sheet.getRow(2).height = 16;
}

function buildDetails(
  wb: ExcelJS.Workbook,
  range: ReportRange,
  rows: ReportRow[],
) {
  const sheet = wb.addWorksheet("Details", {
    views: [{ state: "frozen", ySplit: 4 }],
  });

  sheet.columns = COLUMNS.map((c) => ({ width: c.width }));
  titleBlock(sheet, range, `${rows.length} visit(s)`, COLUMNS.length);

  const header = sheet.getRow(4);
  COLUMNS.forEach((col, i) => {
    const cell = header.getCell(i + 1);
    cell.value = col.header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { horizontal: col.align ?? "left", vertical: "middle" };
  });
  header.height = 20;

  rows.forEach((row, index) => {
    const excelRow = sheet.getRow(5 + index);
    COLUMNS.forEach((col, i) => {
      const cell = excelRow.getCell(i + 1);
      cell.value = col.value(row, index);
      cell.alignment = {
        horizontal: col.align ?? "left",
        vertical: "middle",
        wrapText: col.width >= 26,
      };
      cell.font = { size: 10, color: { argb: INK } };
      cell.border = {
        bottom: { style: "hair", color: { argb: LINE } },
      };
      if (index % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND } };
      }
      // Anything the secretary still needs to look at is coloured, not hidden.
      if (
        col.header === "Status" &&
        (row.status === "estimated" ||
          row.status === "no_checkout" ||
          row.status === "in")
      ) {
        cell.font = { size: 10, bold: true, color: { argb: WARN } };
      }
    });
  });

  if (rows.length === 0) {
    const empty = sheet.getRow(5);
    sheet.mergeCells(5, 1, 5, COLUMNS.length);
    empty.getCell(1).value =
      range.from === range.to
        ? "No visitors logged on this date"
        : "No visitors logged in this period";
    empty.getCell(1).alignment = { horizontal: "center" };
    empty.getCell(1).font = { italic: true, color: { argb: "FF6B7280" } };
  }

  sheet.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: Math.max(4, 4 + rows.length), column: COLUMNS.length },
  };

  return sheet;
}

function buildSummary(
  wb: ExcelJS.Workbook,
  range: ReportRange,
  rows: ReportRow[],
) {
  const sheet = wb.addWorksheet("Summary");
  sheet.columns = [{ width: 34 }, { width: 12 }, { width: 12 }, { width: 14 }];

  titleBlock(
    sheet,
    range,
    range.from === range.to ? "Daily summary" : "Period summary",
    4,
  );

  let r = 4;

  const sectionHeading = (text: string) => {
    r += 1;
    const cell = sheet.getCell(r, 1);
    cell.value = text;
    cell.font = { bold: true, size: 11, color: { argb: INK } };
    r += 1;
  };

  const tableHeader = (labels: string[]) => {
    labels.forEach((label, i) => {
      const cell = sheet.getCell(r, i + 1);
      cell.value = label;
      cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: HEADER_FILL },
      };
      cell.alignment = { horizontal: i === 0 ? "left" : "center" };
    });
    r += 1;
  };

  const dataRow = (values: (string | number)[], warn = false) => {
    values.forEach((value, i) => {
      const cell = sheet.getCell(r, i + 1);
      cell.value = value;
      cell.font = {
        size: 10,
        color: { argb: warn ? WARN : INK },
        bold: warn,
      };
      cell.alignment = { horizontal: i === 0 ? "left" : "center" };
      cell.border = { bottom: { style: "hair", color: { argb: LINE } } };
    });
    r += 1;
  };

  const totalPeople = rows.reduce((sum, x) => sum + x.visitor_count, 0);

  sectionHeading("Totals");
  tableHeader(["", "Visits", "People", ""]);
  dataRow(["All visitors", rows.length, totalPeople, ""]);

  // Only meaningful across more than one day; on a single-day report every row
  // would sit on the same line.
  if (range.from !== range.to) {
    sectionHeading("By day");
    tableHeader(["Date", "Visits", "People", ""]);
    const byDay = countBy(rows, (x) => x.visit_date);
    for (const [day, stats] of [...byDay].sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      dataRow([
        `${dateShort(`${day}T12:00:00+07:00`)} (${weekdayName(`${day}T12:00:00+07:00`).slice(0, 3)})`,
        stats.visits,
        stats.people,
        "",
      ]);
    }
  }

  sectionHeading("By validation");
  tableHeader(["Validation", "Visits", "People", "Free hrs"]);
  const byValidation = countBy(rows, (x) => x.validation_label);
  for (const [label, stats] of [...byValidation].sort((a, b) => b[1].visits - a[1].visits)) {
    const hours = rows
      .filter((x) => x.validation_label === label)
      .reduce((sum, x) => sum + (toNumber(x.free_hours) ?? 0), 0);
    dataRow([label, stats.visits, stats.people, hours || "—"]);
  }

  sectionHeading("By host");
  tableHeader(["Host", "Visits", "People", ""]);
  const byHost = countBy(rows, (x) => x.host_name);
  for (const [host, stats] of [...byHost].sort((a, b) => b[1].visits - a[1].visits)) {
    dataRow([host, stats.visits, stats.people, ""]);
  }

  sectionHeading("By company");
  tableHeader(["Company", "Visits", "People", ""]);
  const byCompany = countBy(rows, (x) => x.company_name);
  for (const [company, stats] of [...byCompany]
    .sort((a, b) => b[1].visits - a[1].visits)
    .slice(0, 10)) {
    dataRow([company, stats.visits, stats.people, ""]);
  }

  // Called out separately so nothing that needs a human is left to be noticed
  // by accident halfway down the Details sheet.
  const stillIn = rows.filter((x) => x.status === "in").length;
  const estimated = rows.filter((x) => x.status === "estimated").length;
  const missing = rows.filter((x) => x.status === "no_checkout").length;

  sectionHeading("Needs attention");
  if (stillIn + estimated + missing === 0) {
    dataRow(["Every visit has a recorded exit time", "", "", ""]);
  } else {
    tableHeader(["", "Visits", "", ""]);
    if (stillIn)
      dataRow(["Still marked as in the building", stillIn, "", ""], true);
    if (estimated)
      dataRow(
        ["Exit time estimated from the free hours", estimated, "", ""],
        true,
      );
    if (missing)
      dataRow(["No exit time recorded at all", missing, "", ""], true);
  }

  return sheet;
}
