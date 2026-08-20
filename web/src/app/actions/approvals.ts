"use server";

import { revalidatePath } from "next/cache";
import { canEdit, getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function fail(error: string): ActionResult {
  return { ok: false, error };
}

async function requireEditor() {
  const profile = await getCurrentProfile();
  return canEdit(profile) ? profile : null;
}

/**
 * Sets the approver on a batch of visits at once - normally the whole day
 * after a single email exchange with the head. There is no roster and no
 * history: this just overwrites whatever was there, because who is expected
 * to approve can change at short notice.
 */
export async function setApproverForVisits(
  ids: string[],
  approverName: string,
): Promise<ActionResult> {
  if (!(await requireEditor()))
    return fail("You do not have permission to edit records");
  if (ids.length === 0) return fail("Select at least one visit first");

  const name = approverName.trim();
  if (!name) return fail("Enter the approver's name");

  const supabase = await createClient();
  const { error } = await supabase
    .from("visits")
    .update({ approver_name: name })
    .in("id", ids);

  if (error) {
    console.error("[approvals] setApproverForVisits failed", error);
    return fail("Could not update the approver");
  }

  revalidatePath("/");
  return { ok: true };
}

/**
 * Records the approval date on a batch of visits at once - the step that
 * happens after the head replies, often for the whole day in one go rather
 * than one row at a time.
 *
 * Every selected visit needs an approver on record first, and the date can't
 * be before the visit itself - both checked here to mirror the database
 * constraints with a message that names the problem instead of a raw
 * Postgres error.
 */
export async function setApprovedOnForVisits(
  ids: string[],
  approvedOn: string,
): Promise<ActionResult> {
  if (!(await requireEditor()))
    return fail("You do not have permission to edit records");
  if (ids.length === 0) return fail("Select at least one visit first");

  const value = approvedOn.trim();
  if (value && !DATE_RE.test(value)) return fail("Invalid date");

  const supabase = await createClient();

  if (value) {
    const { data: rows, error: readError } = await supabase
      .from("visits")
      .select("id, visit_date, approver_name")
      .in("id", ids);

    if (readError) {
      console.error("[approvals] read before setApprovedOn failed", readError);
      return fail("Could not read the selected visits");
    }

    if ((rows ?? []).some((r) => !r.approver_name)) {
      return fail(
        "Set an approver for every selected visit before adding a date",
      );
    }
    if ((rows ?? []).some((r) => value < r.visit_date)) {
      return fail("The approval date cannot be before the visit date");
    }
  }

  const { error } = await supabase
    .from("visits")
    .update({ approved_on: value || null })
    .in("id", ids);

  if (error) {
    console.error("[approvals] setApprovedOnForVisits failed", error);
    return fail("Could not update the approval date");
  }

  revalidatePath("/");
  return { ok: true };
}
