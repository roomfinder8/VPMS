import { cache } from "react";
import { createClient } from "./supabase/server";
import type { Profile } from "./types";

/**
 * Profile of the signed-in user, cached per request.
 * Uses getUser() rather than getSession() because getUser actually verifies the
 * token with Supabase instead of trusting the cookie.
 */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, username, email, full_name, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!data || !data.is_active) return null;
  return data as Profile;
});

/**
 * Both roles may log and edit visits - the split is only about administration.
 * Kept as a named function rather than a bare null check so the read-only case
 * has one place to live if a view-only role is ever added back.
 */
export function canEdit(profile: Profile | null): boolean {
  return profile?.role === "admin" || profile?.role === "user";
}

export function isAdmin(profile: Profile | null): boolean {
  return profile?.role === "admin";
}
