/**
 * Auth cookie lifetime.
 *
 * The requirement is that signing in lasts until the user presses Sign out - no
 * silent logouts mid-shift. Two things have to agree for that to hold:
 *
 *   1. the cookie must outlive the browser session (this file)
 *   2. the Supabase project must not expire the refresh token
 *      (Dashboard -> Authentication -> Sessions: leave "Time-box user sessions"
 *      and "Inactivity timeout" empty)
 *
 * Without (1) the cookie is a session cookie and disappears when the browser
 * closes, which on a phone can be any time the OS decides to reclaim memory.
 *
 * 400 days is the ceiling Chrome enforces on cookie lifetime; anything longer is
 * silently clamped to it, so this is the practical maximum.
 */
export const AUTH_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

export const AUTH_COOKIE_OPTIONS = {
  maxAge: AUTH_COOKIE_MAX_AGE,
  path: "/",
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
} as const;
