import type { ReportRow } from "../src/lib/report/types";

/**
 * Sample data shared by the preview scripts.
 *
 * One row per status, so both the workbook layout and the email body get every
 * conditional path exercised without needing a seeded database - including
 * all three approval states (approved / awaiting / no approver set).
 */
export function sampleRows(date: string): ReportRow[] {
  const base = (partial: Partial<ReportRow>): ReportRow => ({
    visit_date: date,
    time_in: "09:15",
    time_out: "11:15",
    duration_minutes: 120,
    duration_hhmm: "2:00",
    visitor_name: "Visitor",
    visitor_count: 1,
    company_name: "Company",
    host_name: "Host",
    purpose: null,
    validation_code: 1,
    validation_label: "Free 2 hrs",
    free_hours: 2,
    value_baht: null,
    parking_card_no: null,
    license_plate: null,
    vehicle_brand: null,
    remark: null,
    status: "out",
    approver_name: null,
    approved_on: null,
    approval_status: "no_approver",
    created_by_name: "Cholthida",
    ...partial,
  });

  return [
    base({
      visitor_name: "Somchai Jaidee",
      visitor_count: 3,
      company_name: "Acme Engineering Co., Ltd.",
      host_name: "Cholthida",
      parking_card_no: "A-142",
      license_plate: "1กก 1234",
      vehicle_brand: "Toyota",
      purpose: "Project A kickoff",
      validation_code: 2,
      validation_label: "Free 4 hrs",
      free_hours: 4,
      time_out: "13:10",
      duration_hhmm: "3:55",
      duration_minutes: 235,
      approver_name: "Somchai (Head)",
      approved_on: date,
      approval_status: "approved",
    }),
    base({
      visitor_name: "สุดา ทองดี",
      company_name: "บริษัท สยามพัฒนา จำกัด",
      host_name: "Anan",
      time_in: "10:00",
      time_out: "12:00",
      vehicle_brand: "Honda",
      approver_name: "Somchai (Head)",
      approval_status: "awaiting",
    }),
    base({
      visitor_name: "Wipha Suksan",
      company_name: "Nimbus Partners",
      host_name: "Cholthida",
      time_in: "13:30",
      time_out: "20:00",
      duration_hhmm: "6:30",
      duration_minutes: 390,
      validation_code: null,
      validation_label: "Custom 6.5 hrs",
      free_hours: 6.5,
      status: "estimated",
    }),
    base({
      visitor_name: "Kritsada P.",
      company_name: "Acme Engineering Co., Ltd.",
      host_name: "Anan",
      time_in: "14:05",
      time_out: null,
      duration_hhmm: null,
      duration_minutes: null,
      validation_code: 3,
      validation_label: "Free all day",
      free_hours: null,
      status: "no_checkout",
    }),
    base({
      visitor_name: "Nattaya K.",
      company_name: "Bluewave Logistics",
      host_name: "Cholthida",
      time_in: "16:20",
      time_out: null,
      duration_hhmm: null,
      duration_minutes: null,
      vehicle_brand: "Ford",
      status: "in",
    }),
  ];
}
