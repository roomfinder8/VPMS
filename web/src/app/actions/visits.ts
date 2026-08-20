"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { canEdit, getCurrentProfile } from "@/lib/auth";
import { toInstant, todayKey } from "@/lib/tz";
import type { ActionResult, VisitFormValues } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function fail(error: string, field?: keyof VisitFormValues): ActionResult {
  return { ok: false, error, field };
}

async function requireEditor() {
  const profile = await getCurrentProfile();
  if (!canEdit(profile)) return null;
  return profile;
}

/**
 * Look the company up by name and create it if it is new (get-or-create).
 * If a concurrent request creates the same name first (unique violation), select again.
 * If even that fails, return null - visits.company_name still holds the name, so
 * no data is lost.
 */
async function resolveCompanyId(
  supabase: Supabase,
  rawName: string,
): Promise<string | null> {
  const name = rawName.trim();
  const key = name.toLowerCase();

  const { data: found } = await supabase
    .from("companies")
    .select("id")
    .eq("name_key", key)
    .maybeSingle();
  if (found) return found.id;

  const { data: created, error } = await supabase
    .from("companies")
    .insert({ name })
    .select("id")
    .single();
  if (!error) return created.id;

  if (error.code === "23505") {
    const { data: retry } = await supabase
      .from("companies")
      .select("id")
      .eq("name_key", key)
      .maybeSingle();
    return retry?.id ?? null;
  }

  console.error("[visits] resolveCompanyId failed", error);
  return null;
}

async function resolveHostId(
  supabase: Supabase,
  rawName: string,
): Promise<string | null> {
  const name = rawName.trim();
  const { data: found } = await supabase
    .from("hosts")
    .select("id")
    .eq("name_key", name.toLowerCase())
    .maybeSingle();
  // Hosts are never created automatically - the list is managed from settings so
  // the dropdown does not fill up with typos.
  return found?.id ?? null;
}

interface NormalizedVisit {
  check_in_at: string;
  check_out_at: string | null;
  visitor_name: string;
  visitor_count: number;
  company_name: string;
  host_name: string;
  purpose: string | null;
  validation_type_id: number;
  custom_free_hours: number | null;
  parking_card_no: string | null;
  license_plate: string | null;
  vehicle_brand: string | null;
  approver_name: string | null;
  approved_on: string | null;
  remark: string | null;
}

/**
 * Is the chosen validation type the custom one? Read from the database rather
 * than trusted from the client, so a tampered request cannot smuggle hours onto
 * a fixed validation type.
 */
async function isCustomType(
  supabase: Supabase,
  validationTypeId: number,
): Promise<boolean> {
  const { data } = await supabase
    .from("validation_types")
    .select("is_custom")
    .eq("id", validationTypeId)
    .maybeSingle();
  return data?.is_custom === true;
}

function normalize(
  values: VisitFormValues,
  custom: boolean,
): NormalizedVisit | ActionResult {
  const visitorName = values.visitorName?.trim() ?? "";
  const companyName = values.companyName?.trim() ?? "";
  const hostName = values.hostName?.trim() ?? "";

  if (!DATE_RE.test(values.visitDate)) return fail("Invalid date", "visitDate");
  // A future date has no real check-in to log yet - almost always a mistyped
  // year rather than an intentional entry, so it is rejected rather than saved.
  if (values.visitDate > todayKey())
    return fail("The date cannot be in the future", "visitDate");
  if (!TIME_RE.test(values.timeIn))
    return fail("Invalid time in (e.g. 09:15)", "timeIn");
  if (!visitorName) return fail("Enter the visitor's name", "visitorName");
  if (!companyName) return fail("Enter the company name", "companyName");
  if (!hostName) return fail("Enter who they are visiting", "hostName");
  if (!values.validationTypeId)
    return fail("Choose the validation that was stamped", "validationTypeId");

  const count = Number(values.visitorCount);
  if (!Number.isInteger(count) || count < 1 || count > 50)
    return fail("Number of people must be between 1 and 50", "visitorCount");

  let customHours: number | null = null;
  if (custom) {
    const raw = values.customFreeHours?.trim() ?? "";
    if (!raw) return fail("Enter how many free hours", "customFreeHours");
    customHours = Number(raw);
    // Matches visits_custom_free_hours_positive in the database
    if (!Number.isFinite(customHours) || customHours <= 0 || customHours > 24)
      return fail("Free hours must be between 0 and 24", "customFreeHours");
  }

  const checkIn = toInstant(values.visitDate, values.timeIn);

  let checkOut: string | null = null;
  const timeOut = values.timeOut?.trim() ?? "";
  if (timeOut) {
    if (!TIME_RE.test(timeOut))
      return fail("Invalid time out (e.g. 17:30)", "timeOut");
    checkOut = toInstant(values.visitDate, timeOut);
    // Mirrors the visits_checkout_after_checkin constraint in the database.
    // Caught here first so the user sees a sentence rather than a Postgres error.
    if (checkOut < checkIn)
      return fail("Time out cannot be before time in", "timeOut");
  }

  const approverName = values.approverName?.trim() || null;

  let approvedOn: string | null = null;
  const approvedRaw = values.approvedOn?.trim() ?? "";
  if (approvedRaw) {
    if (!DATE_RE.test(approvedRaw))
      return fail("Invalid approval date", "approvedOn");
    // Mirrors visits_approved_after_visit in the database.
    if (approvedRaw < values.visitDate)
      return fail("The approval date cannot be before the visit date", "approvedOn");
    // Mirrors visits_approver_required_when_approved in the database.
    if (!approverName)
      return fail("Set who approved it before adding a date", "approverName");
    approvedOn = approvedRaw;
  }

  return {
    check_in_at: checkIn,
    check_out_at: checkOut,
    visitor_name: visitorName,
    visitor_count: count,
    company_name: companyName,
    host_name: hostName,
    purpose: values.purpose?.trim() || null,
    validation_type_id: Number(values.validationTypeId),
    custom_free_hours: customHours,
    parking_card_no: values.parkingCardNo?.trim() || null,
    license_plate: values.licensePlate?.trim() || null,
    vehicle_brand: values.vehicleBrand?.trim() || null,
    approver_name: approverName,
    approved_on: approvedOn,
    remark: values.remark?.trim() || null,
  };
}

export async function createVisit(
  values: VisitFormValues,
): Promise<ActionResult> {
  const profile = await requireEditor();
  if (!profile) return fail("You do not have permission to add records");
  if (!values.validationTypeId)
    return fail("Choose the validation that was stamped", "validationTypeId");

  const supabase = await createClient();

  const normalized = normalize(
    values,
    await isCustomType(supabase, values.validationTypeId),
  );
  if ("ok" in normalized) return normalized;

  const [companyId, hostId] = await Promise.all([
    resolveCompanyId(supabase, normalized.company_name),
    resolveHostId(supabase, normalized.host_name),
  ]);

  const { error } = await supabase.from("visits").insert({
    ...normalized,
    company_id: companyId,
    host_id: hostId,
    created_by: profile.id,
  });

  if (error) {
    console.error("[visits] createVisit failed", error);
    return fail("Could not save. Please try again.");
  }

  revalidatePath("/");
  return { ok: true };
}

export async function updateVisit(
  values: VisitFormValues,
): Promise<ActionResult> {
  const profile = await requireEditor();
  if (!profile) return fail("You do not have permission to edit records");
  if (!values.id) return fail("Could not find the record to edit");
  if (!values.validationTypeId)
    return fail("Choose the validation that was stamped", "validationTypeId");

  const supabase = await createClient();

  const normalized = normalize(
    values,
    await isCustomType(supabase, values.validationTypeId),
  );
  if ("ok" in normalized) return normalized;

  const [companyId, hostId] = await Promise.all([
    resolveCompanyId(supabase, normalized.company_name),
    resolveHostId(supabase, normalized.host_name),
  ]);

  const { error } = await supabase
    .from("visits")
    .update({
      ...normalized,
      company_id: companyId,
      host_id: hostId,
      // Editing the check-out time by hand means a person confirmed it, so it is
      // no longer something the system guessed.
      auto_closed: false,
    })
    .eq("id", values.id);

  if (error) {
    console.error("[visits] updateVisit failed", error);
    return fail("Could not save changes. Please try again.");
  }

  revalidatePath("/");
  return { ok: true };
}

/**
 * The "Check out now" button - stamps the real current time; the client never
 * supplies it. Restricted to today's own visits: stamping "now" onto a
 * backdated row would silently record an exit time on the wrong day, hours or
 * days away from when the visitor actually left. Editing a past visit still
 * works normally - it just has to go through the form, where the time is
 * typed rather than assumed.
 */
export async function checkOutVisit(id: string): Promise<ActionResult> {
  const profile = await requireEditor();
  if (!profile) return fail("You do not have permission to edit records");

  const supabase = await createClient();

  const { data: visit } = await supabase
    .from("visits")
    .select("visit_date")
    .eq("id", id)
    .maybeSingle();

  if (!visit) return fail("Could not find that visit");
  if (visit.visit_date !== todayKey()) {
    return fail(
      "Only today's visits can be checked out with the current time — edit the record to set a specific time instead.",
    );
  }

  const { error } = await supabase
    .from("visits")
    .update({ check_out_at: new Date().toISOString(), auto_closed: false })
    .eq("id", id)
    .is("check_out_at", null);

  if (error) {
    console.error("[visits] checkOutVisit failed", error);
    return fail("Could not record the check-out time");
  }

  revalidatePath("/");
  return { ok: true };
}

/** Checked out the wrong person - put the visit back to "still in" */
export async function undoCheckOut(id: string): Promise<ActionResult> {
  const profile = await requireEditor();
  if (!profile) return fail("You do not have permission to edit records");

  const supabase = await createClient();
  const { error } = await supabase
    .from("visits")
    .update({ check_out_at: null, auto_closed: false })
    .eq("id", id);

  if (error) {
    console.error("[visits] undoCheckOut failed", error);
    return fail("Could not undo the check-out");
  }

  revalidatePath("/");
  return { ok: true };
}

export async function deleteVisit(id: string): Promise<ActionResult> {
  const profile = await requireEditor();
  if (!profile) return fail("You do not have permission to delete records");

  const supabase = await createClient();
  const { error } = await supabase.from("visits").delete().eq("id", id);

  if (error) {
    console.error("[visits] deleteVisit failed", error);
    return fail("Could not delete");
  }

  revalidatePath("/");
  return { ok: true };
}
