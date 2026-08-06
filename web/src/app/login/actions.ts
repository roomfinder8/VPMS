"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export interface LoginState {
  error?: string;
}

/** Guard against open redirects: only accept in-app paths, not //evil.com or full URLs */
function safeNext(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = String(formData.get("username") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? "/"));

  if (!username || !password) {
    return { error: "Please enter your username and password." };
  }

  // Same message for every failure so nobody can probe which usernames exist.
  const generic: LoginState = { error: "Incorrect username or password." };

  // RLS hides the profiles table from anyone not signed in, so the username to
  // email lookup needs the secret key. It stays entirely on the server - there is
  // no endpoint anyone could hit to enumerate usernames.
  let email: string;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("profiles")
      .select("email, is_active")
      .eq("username", username)
      .maybeSingle();

    if (error) {
      console.error("[login] profile lookup failed", error);
      return { error: "Something went wrong. Please try again." };
    }
    if (!data?.email || !data.is_active) return generic;
    email = data.email;
  } catch (err) {
    console.error("[login] admin client unavailable", err);
    return { error: "The server is not fully configured (SUPABASE_SECRET_KEY)." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return generic;

  redirect(next);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
