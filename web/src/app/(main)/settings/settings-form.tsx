"use client";

import { useState, useTransition } from "react";
import {
  updateReportSettings,
  type ReportSettingsInput,
} from "@/app/actions/settings";
import type { ReportFrequency, ReportSettings } from "@/lib/types";

const DAYS = [
  { iso: 1, label: "Mon" },
  { iso: 2, label: "Tue" },
  { iso: 3, label: "Wed" },
  { iso: 4, label: "Thu" },
  { iso: 5, label: "Fri" },
  { iso: 6, label: "Sat" },
  { iso: 7, label: "Sun" },
];

const inputClass =
  "w-full rounded-xl border border-line bg-raised px-3 py-2.5 text-base outline-none " +
  "transition focus:border-brand focus:ring-2 focus:ring-brand/25";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="text-xs text-ink-faint">{hint}</span>}
      {children}
    </label>
  );
}

export function SettingsForm({ settings }: { settings: ReportSettings }) {
  const [values, setValues] = useState<ReportSettingsInput>({
    recipients: settings.draft_recipients.join("\n"),
    sendTime: settings.send_time.slice(0, 5),
    frequency: settings.frequency,
    sendDays: settings.send_days,
    sendDayOfMonth: settings.send_day_of_month,
    autoSendEnabled: settings.auto_send_enabled,
    autoCloseOpenVisits: settings.auto_close_open_visits,
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof ReportSettingsInput>(
    key: K,
    value: ReportSettingsInput[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }));
    setSaved(false);
    setError(null);
  }

  function toggleDay(iso: number) {
    set(
      "sendDays",
      values.sendDays.includes(iso)
        ? values.sendDays.filter((d) => d !== iso)
        : [...values.sendDays, iso].sort((a, b) => a - b),
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateReportSettings(values);
      if (result.ok) {
        setSaved(true);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-xl border border-line bg-raised p-4">
        <div>
          <h2 className="font-medium">Who receives the report</h2>
          <p className="text-sm text-ink-faint">
            This is the only email the system sends — it goes to whoever checks the
            numbers, who then writes to the manager from their own mailbox.
          </p>
        </div>

        <Field
          label="Report goes to"
          hint="One address per line, or separate them with commas — add as many people as need it"
        >
          <textarea
            rows={3}
            value={values.recipients}
            onChange={(e) => set("recipients", e.target.value)}
            className={inputClass}
            placeholder={"secretary@example.com\nmanager@example.com, someone.else@example.com"}
          />
        </Field>
      </section>

      <section className="flex flex-col gap-4 rounded-xl border border-line bg-raised p-4">
        <div>
          <h2 className="font-medium">Schedule</h2>
          <p className="text-sm text-ink-faint">
            Thailand time. The job checks in regularly and sends once this time has
            passed, so a run missed while the server was down still goes out
            afterwards.
          </p>
        </div>

        <Field label="How often">
          <div className="inline-flex w-fit items-center gap-1 rounded-lg border border-line p-1">
            {(["daily", "monthly"] as ReportFrequency[]).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={values.frequency === f}
                onClick={() => set("frequency", f)}
                className={`h-9 rounded-md px-4 text-sm font-medium capitalize transition
                            ${
                              values.frequency === f
                                ? "bg-brand text-white"
                                : "text-ink-soft hover:bg-surface"
                            }`}
              >
                {f}
              </button>
            ))}
          </div>
          <span className="text-xs text-ink-faint">
            {values.frequency === "monthly"
              ? "One email covering the previous calendar month."
              : "One email per scheduled weekday, covering that day."}
          </span>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Send at">
            <input
              type="time"
              value={values.sendTime}
              onChange={(e) => set("sendTime", e.target.value)}
              className={`${inputClass} tabular`}
            />
          </Field>

          {values.frequency === "monthly" ? (
            <Field label="Day of the month" hint="1–28, so it always exists">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={28}
                value={values.sendDayOfMonth}
                onChange={(e) => set("sendDayOfMonth", Number(e.target.value))}
                className={`${inputClass} tabular`}
              />
            </Field>
          ) : (
            <Field label="On these days">
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map((day) => {
                  const active = values.sendDays.includes(day.iso);
                  return (
                    <button
                      key={day.iso}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleDay(day.iso)}
                      className={`h-10 w-12 rounded-lg border text-sm transition active:scale-[0.98]
                                  ${
                                    active
                                      ? "border-brand bg-brand-soft font-medium text-brand"
                                      : "border-line text-ink-soft hover:bg-surface"
                                  }`}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}
        </div>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={values.autoSendEnabled}
            onChange={(e) => set("autoSendEnabled", e.target.checked)}
            className="mt-1 h-4 w-4"
          />
          <span>
            <span className="text-sm font-medium">Send the report automatically</span>
            <span className="block text-xs text-ink-faint">
              Turn off to send it by hand only.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={values.autoCloseOpenVisits}
            onChange={(e) => set("autoCloseOpenVisits", e.target.checked)}
            className="mt-1 h-4 w-4"
          />
          <span>
            <span className="text-sm font-medium">
              Close visits nobody checked out
            </span>
            <span className="block text-xs text-ink-faint">
              Every day, set the exit time for anything still open yesterday to
              check-in plus the free hours that were stamped, and flag it as
              estimated. &ldquo;Free all day&rdquo; has no hour count, so those are
              flagged as having no exit time instead. This runs daily regardless of
              the schedule above, so the board stays tidy even between monthly
              reports.
            </span>
          </span>
        </label>
      </section>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700
                     dark:bg-red-950/50 dark:text-red-300"
        >
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-12 rounded-xl bg-brand px-6 font-medium text-white transition
                     hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save settings"}
        </button>
        {saved && (
          <span className="text-sm text-ink-soft" role="status">
            Saved
          </span>
        )}
      </div>
    </form>
  );
}
