import type { VisitStatus } from "@/lib/types";

/**
 * One row of public.visits_report.
 *
 * Times arrive already converted to Thailand local time by the view, and are
 * carried through to Excel as plain "HH:mm" text. Writing them as real Excel
 * times would make the file render differently depending on the reader's
 * machine, which is the one thing this report cannot afford.
 */
export interface ReportRow {
  visit_date: string;
  time_in: string;
  time_out: string | null;
  duration_minutes: number | null;
  duration_hhmm: string | null;
  visitor_name: string;
  visitor_count: number;
  company_name: string;
  host_name: string;
  purpose: string | null;
  validation_code: number | null;
  validation_label: string;
  free_hours: number | string | null;
  value_baht: number | string | null;
  parking_card_no: string | null;
  license_plate: string | null;
  remark: string | null;
  status: VisitStatus;
  created_by_name: string | null;
}

export const REPORT_COLUMNS =
  "visit_date, time_in, time_out, duration_minutes, duration_hhmm, visitor_name, " +
  "visitor_count, company_name, host_name, purpose, validation_code, " +
  "validation_label, free_hours, value_baht, parking_card_no, license_plate, " +
  "remark, status, created_by_name, check_in_at";
