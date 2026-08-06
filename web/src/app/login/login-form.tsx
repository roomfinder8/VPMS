"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { login, type LoginState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-12 w-full rounded-xl bg-brand text-white font-medium transition
                 hover:brightness-110 active:brightness-95
                 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-ink-soft">Username</span>
        <input
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          className="h-12 rounded-xl border border-line bg-raised px-4 text-base
                     outline-none transition focus:border-brand
                     focus:ring-2 focus:ring-brand/25"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-ink-soft">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-12 rounded-xl border border-line bg-raised px-4 text-base
                     outline-none transition focus:border-brand
                     focus:ring-2 focus:ring-brand/25"
        />
      </label>

      {state.error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700
                     dark:bg-red-950/50 dark:text-red-300"
        >
          {state.error}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
