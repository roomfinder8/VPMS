import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Client that uses the secret key, so it bypasses RLS entirely.
 *
 * Only for the cases that genuinely need it:
 *   1. resolving a username to an email at login (there is no session yet, so
 *      profiles cannot be read normally)
 *   2. the report / auto-close jobs, which run without a signed-in user
 *
 * Never import this from a client component. The "server-only" import makes the
 * build fail immediately if that happens, which is far better than the key
 * silently ending up in the browser bundle.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) {
    throw new Error("SUPABASE_SECRET_KEY is not set in the environment");
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
