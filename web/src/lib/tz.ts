/**
 * The single place in the app that deals with time zones - do not do date math anywhere else.
 *
 * Rules (see README section 3):
 *   - the database always stores timestamptz (UTC)
 *   - the UI always displays Thailand time, whatever the device is set to
 *   - times typed by the user are always Thailand time and must be turned into an
 *     instant with an explicit offset
 *
 * Never use `new Date("2026-08-06T09:15")`: that is interpreted in the device's own
 * time zone, so a phone set to the wrong zone would silently save a shifted time
 * with no error to notice.
 *
 * The display locale is English but the zone stays Asia/Bangkok - the zone describes
 * where the office is, not what language the app is in.
 */

export const TZ = "Asia/Bangkok";

/** Thailand is a fixed UTC+7 with no DST - matches the interval '+07:00' in the generated column */
export const TZ_OFFSET = "+07:00";

const dateKeyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const timeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const dateLongFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  day: "numeric",
  month: "long",
  year: "numeric",
});

const dateShortFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  day: "numeric",
  month: "short",
  year: "numeric",
});

const weekdayFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  weekday: "long",
});

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/** Today's date in Thailand time as 'YYYY-MM-DD' - compare this against the visit_date column */
export function todayKey(now: Date = new Date()): string {
  return dateKeyFmt.format(now);
}

/** The 'YYYY-MM-DD' Thailand-local date of the given instant */
export function dateKeyOf(value: string | Date): string {
  return dateKeyFmt.format(toDate(value));
}

/** 'HH:mm' in Thailand time - empty string when there is no time yet (e.g. not checked out) */
export function timeHHmm(value: string | Date | null | undefined): string {
  if (!value) return "";
  return timeFmt.format(toDate(value));
}

/** Current Thailand time as 'HH:mm', used to prefill the form */
export function nowHHmm(now: Date = new Date()): string {
  return timeFmt.format(now);
}

/** '6 August 2026' */
export function dateLong(value: string | Date): string {
  return dateLongFmt.format(toDate(value));
}

/** '6 Aug 2026' */
export function dateShort(value: string | Date): string {
  return dateShortFmt.format(toDate(value));
}

/** 'Thursday' */
export function weekdayName(value: string | Date): string {
  return weekdayFmt.format(toDate(value));
}

/**
 * Combine the date and time the user typed (which are Thailand local) into an
 * instant to store in the database.
 *
 *   toInstant('2026-08-06', '09:15') -> '2026-08-06T02:15:00.000Z'
 *
 * The offset is written into the string, so the result does not depend on the time
 * zone of whatever machine runs this - which matters because it is called both in
 * the secretary's browser and on a server running in UTC.
 */
export function toInstant(dateKey: string, hhmm: string): string {
  const normalized = hhmm.length === 5 ? `${hhmm}:00` : hhmm;
  const parsed = new Date(`${dateKey}T${normalized}${TZ_OFFSET}`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date or time: ${dateKey} ${hhmm}`);
  }
  return parsed.toISOString();
}

/** Inverse of toInstant - splits an instant back into Thailand-local date and time for the edit form */
export function fromInstant(iso: string | null | undefined): {
  dateKey: string;
  hhmm: string;
} {
  if (!iso) return { dateKey: todayKey(), hhmm: "" };
  return { dateKey: dateKeyOf(iso), hhmm: timeHHmm(iso) };
}

/** '2:45' from a number of minutes - used to show how long a visitor stayed */
export function durationLabel(minutes: number | null | undefined): string {
  if (minutes == null) return "";
  const safe = Math.max(0, minutes);
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

/** ISO day of week in Thailand time: 1 = Monday .. 7 = Sunday (matches report_settings.send_days) */
export function isoDayOfWeek(value: string | Date = new Date()): number {
  const key = dateKeyOf(value);
  const jsDay = new Date(`${key}T12:00:00${TZ_OFFSET}`).getUTCDay(); // 0 = Sunday
  return jsDay === 0 ? 7 : jsDay;
}

/**
 * Date arithmetic anchored at midday Thailand time.
 *
 * Midday rather than midnight so that adding days can never tip a value across
 * a date boundary through some rounding quirk - there are twelve hours of slack
 * on either side.
 */
export function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00${TZ_OFFSET}`);
  d.setUTCDate(d.getUTCDate() + days);
  return dateKeyOf(d);
}

/** Monday of the week containing dateKey */
export function startOfWeek(dateKey: string): string {
  return addDays(dateKey, -(isoDayOfWeek(dateKey) - 1));
}

export function startOfMonth(dateKey: string): string {
  return `${dateKey.slice(0, 7)}-01`;
}

/** Same day next/previous month, clamped to the last real day if the target month is shorter */
export function addMonths(dateKey: string, months: number): string {
  const d = new Date(`${dateKey}T12:00:00${TZ_OFFSET}`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return dateKeyOf(d);
}

/** 'August 2026' */
export function monthLabel(dateKey: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    month: "long",
    year: "numeric",
  }).format(new Date(`${dateKey}T12:00:00${TZ_OFFSET}`));
}

/** Whole days between two date keys, inclusive of both ends */
export function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00${TZ_OFFSET}`).getTime();
  const b = new Date(`${to}T12:00:00${TZ_OFFSET}`).getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

/**
 * '6 August 2026' for a single day, '1 – 6 August 2026' inside one month,
 * '28 July – 6 August 2026' otherwise.
 */
export function dateRangeLabel(from: string, to: string): string {
  if (from === to) return dateLong(`${from}T12:00:00${TZ_OFFSET}`);

  const a = `${from}T12:00:00${TZ_OFFSET}`;
  const b = `${to}T12:00:00${TZ_OFFSET}`;
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);

  if (sameMonth) {
    const day = new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ,
      day: "numeric",
    }).format(new Date(a));
    return `${day} – ${dateLong(b)}`;
  }

  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  const startFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    day: "numeric",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  return `${startFmt.format(new Date(a))} – ${dateLong(b)}`;
}
