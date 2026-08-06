"use client";

import { useMemo, useState, useTransition } from "react";
import {
  checkOutVisit,
  deleteVisit,
  undoCheckOut,
} from "@/app/actions/visits";
import {
  dateLong,
  durationLabel,
  fromInstant,
  nowHHmm,
  timeHHmm,
  weekdayName,
} from "@/lib/tz";
import {
  formatHours,
  validationLabel,
  visitStatus,
  type Company,
  type Host,
  type ReportRun,
  type ReportSettings,
  type ValidationType,
  type Visit,
  type VisitFormValues,
} from "@/lib/types";
import { ExportPanel } from "./export-panel";
import { ReportCard } from "./report-card";
import { VisitSheet } from "./visit-sheet";

/**
 * Tailwind needs to see complete class names at build time, so these are a fixed map.
 * Building them dynamically (`bg-${color}-100`) would get purged and the colours would vanish.
 */
const BADGE: Record<string, string> = {
  sky: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  violet: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  amber: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  emerald: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  rose: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  slate: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
};

function badgeClass(color: string) {
  return BADGE[color] ?? BADGE.slate;
}

interface Props {
  today: string;
  visits: Visit[];
  validationTypes: ValidationType[];
  hosts: Host[];
  companies: Company[];
  settings: ReportSettings;
  runs: ReportRun[];
  editable: boolean;
  isAdmin: boolean;
}

function emptyForm(today: string): VisitFormValues {
  return {
    visitDate: today,
    timeIn: nowHHmm(),
    timeOut: "",
    visitorName: "",
    visitorCount: 1,
    companyName: "",
    hostName: "",
    purpose: "",
    validationTypeId: null,
    customFreeHours: "",
    parkingCardNo: "",
    licensePlate: "",
    remark: "",
  };
}

function toForm(visit: Visit): VisitFormValues {
  return {
    id: visit.id,
    visitDate: visit.visit_date,
    timeIn: timeHHmm(visit.check_in_at),
    timeOut: fromInstant(visit.check_out_at).hhmm,
    visitorName: visit.visitor_name,
    visitorCount: visit.visitor_count,
    companyName: visit.company_name,
    hostName: visit.host_name,
    purpose: visit.purpose ?? "",
    validationTypeId: visit.validation_type_id,
    customFreeHours: formatHours(visit.custom_free_hours),
    parkingCardNo: visit.parking_card_no ?? "",
    licensePlate: visit.license_plate ?? "",
    remark: visit.remark ?? "",
  };
}

export function TodayBoard({
  today,
  visits,
  validationTypes,
  hosts,
  companies,
  settings,
  runs,
  editable,
  isAdmin,
}: Props) {
  const [sheet, setSheet] = useState<VisitFormValues | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const typeById = useMemo(
    () => new Map(validationTypes.map((t) => [t.id, t])),
    [validationTypes],
  );

  // Split on status, not on check_out_at: a row the end-of-day job closed without
  // being able to derive an exit still has a null time but is no longer "in".
  const open = visits.filter((v) => visitStatus(v) === "in");
  const closed = visits.filter((v) => visitStatus(v) !== "in");

  const perType = useMemo(() => {
    const counts = new Map<number, number>();
    for (const v of visits) {
      counts.set(v.validation_type_id, (counts.get(v.validation_type_id) ?? 0) + 1);
    }
    return validationTypes
      .map((t) => ({ type: t, count: counts.get(t.id) ?? 0 }))
      .filter((row) => row.count > 0);
  }, [visits, validationTypes]);

  const headOfDay = `${today}T12:00:00+07:00`;

  function run(id: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setPendingId(id);
    setMessage(null);
    startTransition(async () => {
      const result = await fn();
      setPendingId(null);
      if (!result.ok) setMessage(result.error ?? "That did not work.");
    });
  }

  function renderVisit(visit: Visit) {
    const type = typeById.get(visit.validation_type_id);
    const status = visitStatus(visit);
    const busy = pendingId === visit.id;

    return (
      <li
        key={visit.id}
        className={`rounded-xl border border-line bg-raised p-3 transition
                    ${busy ? "opacity-50" : ""}`}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* times */}
          <div className="tabular flex shrink-0 items-baseline gap-1.5 sm:w-28 sm:flex-col sm:gap-0">
            <span className="text-base font-semibold">
              {timeHHmm(visit.check_in_at)}
            </span>
            <span className="text-sm text-ink-faint">
              {visit.check_out_at
                ? `→ ${timeHHmm(visit.check_out_at)}`
                : status === "no_checkout"
                  ? "→ —"
                  : "still in"}
            </span>
            {visit.duration_minutes != null && (
              <span className="text-xs text-ink-faint">
                {durationLabel(visit.duration_minutes)} hrs
              </span>
            )}
          </div>

          {/* visitor details */}
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">
              {visit.visitor_name}
              {visit.visitor_count > 1 && (
                <span className="ml-1.5 text-sm font-normal text-ink-faint">
                  +{visit.visitor_count - 1}
                </span>
              )}
            </p>
            <p className="truncate text-sm text-ink-soft">
              {visit.company_name}
              <span className="mx-1.5 text-ink-faint">›</span>
              {visit.host_name}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {type && (
                <span
                  className={`rounded-md px-2 py-0.5 text-xs font-medium ${badgeClass(type.color)}`}
                >
                  {validationLabel(visit, type)}
                </span>
              )}
              {visit.parking_card_no && (
                <span className="tabular rounded-md bg-surface px-2 py-0.5 text-xs text-ink-soft">
                  Card {visit.parking_card_no}
                </span>
              )}
              {status === "estimated" && (
                <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs text-amber-900
                                 dark:bg-amber-950 dark:text-amber-200">
                  Exit time estimated
                </span>
              )}
              {status === "no_checkout" && (
                <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs text-amber-900
                                 dark:bg-amber-950 dark:text-amber-200">
                  No check-out recorded
                </span>
              )}
            </div>
          </div>

          {/* actions */}
          {editable && (
            <div className="flex shrink-0 items-center gap-2">
              {!visit.check_out_at ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(visit.id, () => checkOutVisit(visit.id))}
                  className="h-11 flex-1 rounded-lg bg-brand px-3 text-sm font-medium text-white
                             transition hover:brightness-110 active:scale-[0.98]
                             disabled:opacity-60 sm:h-10 sm:flex-none"
                >
                  Check out now
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(visit.id, () => undoCheckOut(visit.id))}
                  className="h-10 rounded-lg border border-line px-3 text-sm text-ink-soft
                             transition hover:bg-surface disabled:opacity-60"
                >
                  Undo check-out
                </button>
              )}

              <button
                type="button"
                disabled={busy}
                onClick={() => setSheet(toForm(visit))}
                className="h-11 rounded-lg border border-line px-3 text-sm text-ink-soft
                           transition hover:bg-surface disabled:opacity-60 sm:h-10"
              >
                Edit
              </button>

              <button
                type="button"
                disabled={busy}
                aria-label={`Delete the record for ${visit.visitor_name}`}
                onClick={() => {
                  if (confirm(`Delete the record for ${visit.visitor_name}?`)) {
                    run(visit.id, () => deleteVisit(visit.id));
                  }
                }}
                className="h-11 rounded-lg border border-line px-3 text-sm text-ink-faint
                           transition hover:bg-surface hover:text-red-600 disabled:opacity-60 sm:h-10"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* day header and summary */}
      <section>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {dateLong(headOfDay)}
            </h1>
            <p className="text-sm text-ink-faint">{weekdayName(headOfDay)}</p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <ExportPanel today={today} />

            {editable && (
              <button
                type="button"
                onClick={() => setSheet(emptyForm(today))}
                className="hidden h-11 rounded-xl bg-brand px-4 font-medium text-white
                           transition hover:brightness-110 active:scale-[0.98] sm:block"
              >
                ＋ Add visitor
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-lg bg-raised px-2.5 py-1 border border-line">
            <b className="tabular">{visits.length}</b> total
          </span>
          {open.length > 0 && (
            <span className="rounded-lg bg-brand-soft px-2.5 py-1 text-brand">
              <b className="tabular">{open.length}</b> still in
            </span>
          )}
          {perType.map(({ type, count }) => (
            <span
              key={type.id}
              className={`rounded-lg px-2.5 py-1 ${badgeClass(type.color)}`}
            >
              {type.label} <b className="tabular">{count}</b>
            </span>
          ))}
        </div>
      </section>

      {message && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700
                     dark:bg-red-950/50 dark:text-red-300"
        >
          {message}
        </p>
      )}

      {visits.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line py-14 text-center">
          <p className="text-ink-soft">No visitors logged today</p>
          {editable && (
            <p className="mt-1 text-sm text-ink-faint">
              Tap “Add visitor” after stamping the first parking card.
            </p>
          )}
        </div>
      ) : (
        <>
          {open.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-medium text-ink-soft">
                Still in ({open.length})
              </h2>
              <ul className="flex flex-col gap-2">{open.map(renderVisit)}</ul>
            </section>
          )}

          {closed.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-medium text-ink-soft">
                Checked out ({closed.length})
              </h2>
              <ul className="flex flex-col gap-2">{closed.map(renderVisit)}</ul>
            </section>
          )}
        </>
      )}

      <ReportCard
        today={today}
        runs={runs}
        recipients={settings.draft_recipients}
        sendTime={settings.send_time}
        autoSendEnabled={settings.auto_send_enabled}
        editable={editable}
        isAdmin={isAdmin}
      />

      {/* Floating button for phones - the secretary walks to the stamping device
          and logs the visit from there. */}
      {editable && (
        <button
          type="button"
          onClick={() => setSheet(emptyForm(today))}
          aria-label="Add visitor"
          className="fixed bottom-6 right-5 z-20 h-14 rounded-full bg-brand px-5
                     font-medium text-white shadow-lg transition
                     active:scale-95 sm:hidden"
        >
          ＋ Add
        </button>
      )}

      {sheet && (
        <VisitSheet
          key={sheet.id ?? "new"}
          initial={sheet}
          validationTypes={validationTypes}
          hosts={hosts}
          companies={companies}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}
