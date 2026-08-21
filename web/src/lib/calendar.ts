import { addDays, addMonths, startOfMonth, startOfWeek } from "./tz";

/**
 * Builds the grid a month calendar renders: full ISO weeks (Monday first,
 * matching startOfWeek elsewhere in the app), including the leading and
 * trailing days from adjacent months needed to keep every row a complete
 * seven days.
 */
export function monthGrid(dateKey: string): string[][] {
  const firstOfMonth = startOfMonth(dateKey);
  const lastOfMonth = addDays(addMonths(firstOfMonth, 1), -1);

  const gridStart = startOfWeek(firstOfMonth);
  const gridEnd = addDays(startOfWeek(lastOfMonth), 6);

  const weeks: string[][] = [];
  let week: string[] = [];
  let cursor = gridStart;

  while (cursor <= gridEnd) {
    week.push(cursor);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
    cursor = addDays(cursor, 1);
  }

  return weeks;
}

/** The seven date keys (Monday to Sunday) of the week containing dateKey */
export function weekDates(dateKey: string): string[] {
  const start = startOfWeek(dateKey);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
