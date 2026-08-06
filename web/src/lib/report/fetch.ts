import { REPORT_COLUMNS, type ReportRow } from "./types";

/**
 * Reads the rows behind a report.
 *
 * Takes the client as an argument because the same query runs three ways: as
 * the signed-in user for the Export button and the manual send (RLS applies),
 * and with the service-role key from the scheduled job, which has no session.
 */
interface QueryableClient {
  from: (table: string) => {
    select: (columns: string) => {
      gte: (
        column: string,
        value: string,
      ) => {
        lte: (
          column: string,
          value: string,
        ) => {
          order: (
            column: string,
            opts: { ascending: boolean },
          ) => PromiseLike<{
            data: unknown[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
}

export async function fetchReportRows(
  supabase: QueryableClient,
  from: string,
  to: string,
): Promise<ReportRow[]> {
  const { data, error } = await supabase
    .from("visits_report")
    .select(REPORT_COLUMNS)
    .gte("visit_date", from)
    .lte("visit_date", to)
    .order("check_in_at", { ascending: true });

  if (error) {
    throw new Error(`Could not read visits: ${error.message}`);
  }

  return (data ?? []) as ReportRow[];
}
