"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { sendReportNow } from "@/app/actions/reports";
import { timeHHmm } from "@/lib/tz";
import type { ReportRun } from "@/lib/types";

interface Props {
  /** the day this report covers - not necessarily today */
  date: string;
  isToday: boolean;
  runs: ReportRun[];
  recipients: string[];
  sendTime: string;
  autoSendEnabled: boolean;
  editable: boolean;
  isAdmin: boolean;
}

export function ReportCard({
  date,
  isToday,
  runs,
  recipients,
  sendTime,
  autoSendEnabled,
  editable,
  isAdmin,
}: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const lastRun = runs[0] ?? null;
  const alreadySent = runs.some((r) => r.status === "sent");
  const configured = recipients.length > 0;

  function send() {
    setBusy(true);
    setMessage(null);
    startTransition(async () => {
      const result = await sendReportNow(date);
      setBusy(false);
      setMessage(result.ok ? null : (result.error ?? "Could not send"));
    });
  }

  return (
    <section className="rounded-xl border border-line bg-raised p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">
            {isToday ? "Daily report" : "Report for this date"}
          </h2>
          <p className="text-sm text-ink-faint">
            {isToday
              ? autoSendEnabled
                ? `Emailed to ${configured ? recipients.join(", ") : "nobody yet"} at ${sendTime.slice(0, 5)}, with the Excel file attached.`
                : "Automatic sending is switched off — send it by hand below."
              : "The schedule only sends today's report — use the button below to send this date by hand."}
          </p>
        </div>

        {isAdmin && (
          <Link
            href="/settings"
            className="text-sm text-brand underline underline-offset-2"
          >
            Settings
          </Link>
        )}
      </div>

      <p className="mt-3 text-sm">
        {!lastRun ? (
          <span className="text-ink-faint">
            {isToday ? "Not sent yet today." : "Not sent for this date yet."}
          </span>
        ) : lastRun.status === "sent" ? (
          <span className="text-ink-soft">
            Sent {timeHHmm(lastRun.created_at)} to {lastRun.recipients.join(", ")}
            {lastRun.visit_count !== null && ` · ${lastRun.visit_count} visits`}
          </span>
        ) : lastRun.status === "failed" ? (
          <span className="text-red-600 dark:text-red-400">
            Failed {timeHHmm(lastRun.created_at)} — {lastRun.error}
          </span>
        ) : (
          <span className="text-ink-faint">
            Skipped {timeHHmm(lastRun.created_at)} — {lastRun.error}
          </span>
        )}
      </p>

      {!configured && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900
                      dark:bg-amber-950/40 dark:text-amber-200">
          No email address is configured yet, so nothing can be sent.{" "}
          {isAdmin ? (
            <Link href="/settings" className="underline underline-offset-2">
              Add one in Settings
            </Link>
          ) : (
            "Ask an administrator to add one"
          )}
          .
        </p>
      )}

      {message && (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700
                     dark:bg-red-950/50 dark:text-red-300"
        >
          {message}
        </p>
      )}

      {editable && (
        <div className="mt-4">
          <button
            type="button"
            disabled={busy || !configured}
            onClick={send}
            className="h-11 rounded-lg border border-line px-4 text-sm font-medium text-ink-soft
                       transition hover:bg-surface disabled:opacity-50 sm:h-10"
          >
            {busy
              ? "Sending…"
              : alreadySent
                ? "Send again now"
                : "Send now"}
          </button>
        </div>
      )}
    </section>
  );
}
