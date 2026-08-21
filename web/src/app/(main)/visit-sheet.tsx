"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { createVisit, updateVisit } from "@/app/actions/visits";
import { approvalStatus, APPROVAL_STATUS_LABEL } from "@/lib/types";
import type {
  Company,
  Host,
  ValidationType,
  VisitFormValues,
} from "@/lib/types";

const PICKER: Record<string, string> = {
  sky: "border-sky-500 bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-100",
  violet:
    "border-violet-500 bg-violet-50 text-violet-900 dark:bg-violet-950 dark:text-violet-100",
  amber:
    "border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  emerald:
    "border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  rose: "border-rose-500 bg-rose-50 text-rose-900 dark:bg-rose-950 dark:text-rose-100",
  slate:
    "border-slate-500 bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100",
};

const inputClass =
  "h-12 w-full rounded-xl border border-line bg-raised px-3 text-base outline-none " +
  "transition focus:border-brand focus:ring-2 focus:ring-brand/25";

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
      {children}
    </h3>
  );
}

interface Props {
  initial: VisitFormValues;
  validationTypes: ValidationType[];
  hosts: Host[];
  companies: Company[];
  vehicleBrands: string[];
  approverNames: string[];
  onClose: () => void;
}

export function VisitSheet({
  initial,
  validationTypes,
  hosts,
  companies,
  vehicleBrands,
  approverNames,
  onClose,
}: Props) {
  const [values, setValues] = useState<VisitFormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const formId = useId();
  const companyListId = useId();
  const hostListId = useId();
  const vehicleListId = useId();
  const approverListId = useId();
  const isEdit = Boolean(initial.id);
  const selectedType = validationTypes.find(
    (t) => t.id === values.validationTypeId,
  );

  const currentApprovalStatus = approvalStatus({
    approver_name: values.approverName || null,
    approved_on: values.approvedOn || null,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Stop the page behind the sheet from scrolling with the finger on mobile.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  function set<K extends keyof VisitFormValues>(
    key: K,
    value: VisitFormValues[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }));
    if (errorField === key) {
      setError(null);
      setErrorField(null);
    }
  }

  function ring(field: string) {
    return errorField === field ? "border-red-500 ring-2 ring-red-500/25" : "";
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setErrorField(null);

    startTransition(async () => {
      const result = isEdit
        ? await updateVisit(values)
        : await createVisit(values);

      if (result.ok) {
        onClose();
        return;
      }
      setError(result.error);
      setErrorField(result.field ?? null);
    });
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? "Edit visit" : "Add visitor"}
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-raised
                   sm:max-w-2xl sm:rounded-2xl sm:shadow-xl"
      >
        {/* Header and footer are fixed flex children, not scroll-following
            "sticky" elements, so Save is never a scroll away regardless of
            how long the form gets. */}
        <div className="flex shrink-0 items-center justify-between
                        border-b border-line px-4 py-3">
          <h2 className="font-semibold">
            {isEdit ? "Edit visit" : "Add visitor"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-ink-soft hover:bg-surface"
          >
            Close
          </button>
        </div>

        <form
          id={formId}
          onSubmit={submit}
          className="flex flex-1 flex-col gap-5 overflow-y-auto p-4"
        >
          {/* ===== Visit ===== */}
          <div className="flex flex-col gap-4">
            <GroupLabel>Visit</GroupLabel>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-ink-soft">Time in</span>
                <input
                  type="time"
                  value={values.timeIn}
                  onChange={(e) => set("timeIn", e.target.value)}
                  className={`${inputClass} tabular ${ring("timeIn")}`}
                  required
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-ink-soft">
                  Time out <span className="text-ink-faint">(optional)</span>
                </span>
                <input
                  type="time"
                  value={values.timeOut}
                  onChange={(e) => set("timeOut", e.target.value)}
                  className={`${inputClass} tabular ${ring("timeOut")}`}
                />
              </label>
            </div>

            <div className="grid grid-cols-[1fr_5.5rem] gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-ink-soft">Visitor name</span>
                <input
                  value={values.visitorName}
                  onChange={(e) => set("visitorName", e.target.value)}
                  className={`${inputClass} ${ring("visitorName")}`}
                  autoFocus={!isEdit}
                  required
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-ink-soft">People</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={50}
                  value={values.visitorCount}
                  onChange={(e) => set("visitorCount", Number(e.target.value))}
                  className={`${inputClass} tabular ${ring("visitorCount")}`}
                />
              </label>
            </div>

            {/* company - datalist works on desktop and mobile with no JS of our own */}
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-ink-soft">Company</span>
              <input
                value={values.companyName}
                onChange={(e) => set("companyName", e.target.value)}
                list={companyListId}
                className={`${inputClass} ${ring("companyName")}`}
                required
              />
              <datalist id={companyListId}>
                {companies.map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-ink-soft">Host (person visited)</span>
              <input
                value={values.hostName}
                onChange={(e) => set("hostName", e.target.value)}
                list={hostListId}
                className={`${inputClass} ${ring("hostName")}`}
                required
              />
              <datalist id={hostListId}>
                {hosts.map((h) => (
                  <option key={h.id} value={h.name}>
                    {h.department ?? ""}
                  </option>
                ))}
              </datalist>
              {hosts.length === 0 && (
                <span className="text-xs text-ink-faint">
                  No hosts configured yet — just type a name; the list can be
                  filled in later from settings.
                </span>
              )}
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-ink-soft">
                Purpose / note <span className="text-ink-faint">(optional)</span>
              </span>
              <input
                value={values.purpose}
                onChange={(e) => set("purpose", e.target.value)}
                placeholder="e.g. Project A meeting"
                className={inputClass}
              />
            </label>
          </div>

          {/* ===== Parking ===== */}
          <div className="flex flex-col gap-4 border-t border-line pt-5">
            <GroupLabel>Parking</GroupLabel>

            {/* validation - large buttons, one tap, no dropdown */}
            <div className="flex flex-col gap-1.5">
              <span className="text-sm text-ink-soft">Validation stamped</span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {validationTypes.map((t) => {
                  const active = values.validationTypeId === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => set("validationTypeId", t.id)}
                      aria-pressed={active}
                      className={`flex h-16 flex-col items-center justify-center rounded-xl border-2
                                  text-sm font-medium transition active:scale-[0.98]
                                  ${
                                    active
                                      ? (PICKER[t.color] ?? PICKER.slate)
                                      : "border-line bg-raised text-ink-soft hover:bg-surface"
                                  }`}
                    >
                      <span className="tabular text-xs opacity-60">
                        {t.is_custom ? "own hours" : `key ${t.id}`}
                      </span>
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>
              {errorField === "validationTypeId" && (
                <span className="text-xs text-red-600">{error}</span>
              )}
            </div>

            {/* Only shown for the custom slot, where hours are per visit rather
                than fixed by the validation type. */}
            {selectedType?.is_custom && (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-ink-soft">Free hours</span>
                <input
                  value={values.customFreeHours}
                  onChange={(e) => set("customFreeHours", e.target.value)}
                  inputMode="decimal"
                  placeholder="e.g. 6 or 1.5"
                  className={`${inputClass} tabular ${ring("customFreeHours")}`}
                  autoFocus
                />
                {errorField === "customFreeHours" && (
                  <span className="text-xs text-red-600">{error}</span>
                )}
              </label>
            )}

            {/* vehicle + plate identify one physical car, so they sit together */}
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-ink-soft">
                  Vehicle brand <span className="text-ink-faint">(optional)</span>
                </span>
                <input
                  value={values.vehicleBrand}
                  onChange={(e) => set("vehicleBrand", e.target.value)}
                  list={vehicleListId}
                  placeholder="e.g. Toyota"
                  className={inputClass}
                />
                <datalist id={vehicleListId}>
                  {vehicleBrands.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-ink-soft">
                  Licence plate <span className="text-ink-faint">(optional)</span>
                </span>
                <input
                  value={values.licensePlate}
                  onChange={(e) => set("licensePlate", e.target.value)}
                  className={inputClass}
                />
              </label>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-ink-soft">
                Parking card no. <span className="text-ink-faint">(optional)</span>
              </span>
              <input
                value={values.parkingCardNo}
                onChange={(e) => set("parkingCardNo", e.target.value)}
                inputMode="numeric"
                className={`${inputClass} tabular`}
              />
            </label>
          </div>

          {/* ===== Approval ===== */}
          <div className="flex flex-col gap-4 border-t border-line pt-5">
            <div className="flex w-full items-center justify-between">
              <GroupLabel>Approval</GroupLabel>
              <span className="text-xs text-ink-faint">
                {APPROVAL_STATUS_LABEL[currentApprovalStatus]}
              </span>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-ink-soft">
                Approver <span className="text-ink-faint">(optional)</span>
              </span>
              <input
                value={values.approverName}
                onChange={(e) => set("approverName", e.target.value)}
                list={approverListId}
                placeholder="Who is expected to approve this"
                className={`${inputClass} ${ring("approverName")}`}
              />
              <datalist id={approverListId}>
                {approverNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
              {errorField === "approverName" && (
                <span className="text-xs text-red-600">{error}</span>
              )}
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-ink-soft">
                Approved on{" "}
                <span className="text-ink-faint">
                  (fill in once the head confirms)
                </span>
              </span>
              <input
                type="date"
                value={values.approvedOn}
                min={values.visitDate}
                onChange={(e) => set("approvedOn", e.target.value)}
                className={`${inputClass} tabular ${ring("approvedOn")}`}
              />
              {errorField === "approvedOn" && (
                <span className="text-xs text-red-600">{error}</span>
              )}
            </label>
          </div>

          {error &&
            errorField !== "validationTypeId" &&
            errorField !== "customFreeHours" &&
            errorField !== "approverName" &&
            errorField !== "approvedOn" && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700
                         dark:bg-red-950/50 dark:text-red-300"
            >
              {error}
            </p>
          )}

        </form>

        <div className="flex shrink-0 gap-3 border-t border-line px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="h-12 flex-1 rounded-xl border border-line font-medium text-ink-soft
                       transition hover:bg-surface"
          >
            Cancel
          </button>
          <button
            type="submit"
            form={formId}
            disabled={pending}
            className="h-12 flex-[2] rounded-xl bg-brand font-medium text-white
                       transition hover:brightness-110 active:scale-[0.98]
                       disabled:opacity-60"
          >
            {pending ? "Saving…" : isEdit ? "Save changes" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
