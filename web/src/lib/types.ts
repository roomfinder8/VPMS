/** admin = full access incl. settings and user management; user = logs and edits visits */
export type Role = "admin" | "user";

/**
 * in           - still here, nobody has recorded an exit
 * out          - somebody recorded the exit time
 * estimated    - the end-of-day job derived it from check-in + free hours
 * no_checkout  - the day was closed but no exit could be derived ("all day" has no hour count)
 */
export type VisitStatus = "in" | "out" | "estimated" | "no_checkout";

export const STATUS_LABEL: Record<VisitStatus, string> = {
  in: "Still in",
  out: "Checked out",
  estimated: "Estimated",
  no_checkout: "No check-out",
};

/**
 * no_approver - nobody has been named yet
 * awaiting    - named, but the head hasn't confirmed by email yet
 * approved    - both an approver and a date are on record
 */
export type ApprovalStatus = "no_approver" | "awaiting" | "approved";

export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = {
  no_approver: "No approver set",
  awaiting: "Awaiting approval",
  approved: "Approved",
};

export function approvalStatus(
  visit: Pick<Visit, "approver_name" | "approved_on">,
): ApprovalStatus {
  if (!visit.approver_name) return "no_approver";
  if (!visit.approved_on) return "awaiting";
  return "approved";
}

export interface Profile {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
}

export interface ValidationType {
  id: number;
  label: string;
  free_hours: number | null;
  value_baht: number | null;
  color: string;
  sort_order: number;
  is_active: boolean;
  is_confirmed: boolean;
  /** true = hours are typed per visit into visits.custom_free_hours; id is not a device key */
  is_custom: boolean;
  note: string | null;
}

/** Postgres numeric can arrive as a string; normalise before doing anything with it */
export function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** 6 -> '6', 6.5 -> '6.5' */
export function formatHours(value: number | string | null | undefined): string {
  const n = toNumber(value);
  return n === null ? "" : String(n);
}

/** What to show on the badge - custom visits carry their own hours */
export function validationLabel(
  visit: Pick<Visit, "custom_free_hours">,
  type: ValidationType | undefined,
): string {
  if (!type) return "";
  if (type.is_custom) {
    const hours = formatHours(visit.custom_free_hours);
    return hours ? `Custom ${hours} hrs` : type.label;
  }
  return type.label;
}

/**
 * Free-text values (vehicle brand, approver name) with no lookup table behind
 * them: dedupe and sort what has actually been typed before, to drive an
 * autocomplete list without inventing a schema for an open set.
 */
export function distinctSorted(values: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  for (const v of values) {
    const trimmed = v?.trim();
    if (trimmed) seen.add(trimmed);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

export interface Company {
  id: string;
  name: string;
  visit_count: number;
}

export interface Host {
  id: string;
  name: string;
  department: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface Visit {
  id: string;
  check_in_at: string;
  check_out_at: string | null;
  visit_date: string;
  duration_minutes: number | null;
  visitor_name: string;
  visitor_count: number;
  company_id: string | null;
  company_name: string;
  host_id: string | null;
  host_name: string;
  purpose: string | null;
  validation_type_id: number;
  custom_free_hours: number | string | null;
  parking_card_no: string | null;
  license_plate: string | null;
  vehicle_brand: string | null;
  remark: string | null;
  auto_closed: boolean;
  approver_name: string | null;
  /** 'YYYY-MM-DD', set once the head confirms */
  approved_on: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function visitStatus(visit: Visit): VisitStatus {
  if (!visit.check_out_at) return visit.auto_closed ? "no_checkout" : "in";
  return visit.auto_closed ? "estimated" : "out";
}

/** What the form submits - times are 'HH:mm' in Thailand time, not yet converted to instants */
export interface VisitFormValues {
  id?: string;
  visitDate: string;
  timeIn: string;
  timeOut: string;
  visitorName: string;
  visitorCount: number;
  companyName: string;
  hostName: string;
  purpose: string;
  validationTypeId: number | null;
  /** only used when the chosen type is_custom; kept as a string so the input can be empty */
  customFreeHours: string;
  parkingCardNo: string;
  licensePlate: string;
  vehicleBrand: string;
  /** who is expected to approve this visit - free text, can change at short notice */
  approverName: string;
  /** 'YYYY-MM-DD' once the head has confirmed by email, else empty */
  approvedOn: string;
  remark: string;
}

export interface ReportSettings {
  /** Who receives the daily report - the reviewer, not the manager */
  draft_recipients: string[];
  /** 'HH:MM:SS' in Thailand time */
  send_time: string;
  /** ISO day of week, 1 = Monday .. 7 = Sunday */
  send_days: number[];
  report_timezone: string;
  auto_send_enabled: boolean;
  auto_close_open_visits: boolean;
  updated_at: string;
}

export interface ReportRun {
  id: string;
  report_date: string;
  /** Always 'draft': the only email the system sends is the one to the reviewer */
  kind: "draft";
  status: "sent" | "failed" | "skipped";
  recipients: string[];
  visit_count: number | null;
  open_count: number | null;
  error: string | null;
  triggered_by: string | null;
  created_at: string;
}

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; field?: keyof VisitFormValues };
