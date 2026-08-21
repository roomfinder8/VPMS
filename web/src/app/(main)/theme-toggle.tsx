"use client";

import { useEffect, useState } from "react";
import { THEME_STORAGE_KEY } from "@/lib/theme-script";

function currentlyDark(): boolean {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dark") return true;
  if (attr === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * A manual override on top of the system light/dark preference the rest of
 * the app follows by default. Starts as `null` (unknown) so the very first
 * render matches the server - which has no way to know the visitor's system
 * preference or stored choice - and resolves to the real value in an effect
 * right after mount, before the user can see or click a wrong icon.
 */
export function ThemeToggle() {
  const [isDark, setIsDark] = useState<boolean | null>(null);

  useEffect(() => {
    setIsDark(currentlyDark());
  }, []);

  function toggle() {
    const next = !currentlyDark();
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
    localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
    setIsDark(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={
        isDark === null
          ? "Toggle dark mode"
          : isDark
            ? "Switch to light mode"
            : "Switch to dark mode"
      }
      disabled={isDark === null}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border
                 border-line text-ink-soft transition hover:bg-surface
                 active:scale-[0.98] disabled:opacity-0 sm:h-9 sm:w-9"
    >
      {isDark && (
        // sun - shown while dark, click to go light
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="4" />
          <path
            strokeLinecap="round"
            d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
          />
        </svg>
      )}
      {isDark === false && (
        // moon - shown while light, click to go dark
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 1020.354 15.354z" />
        </svg>
      )}
    </button>
  );
}
