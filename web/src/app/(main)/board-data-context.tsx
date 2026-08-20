"use client";

import { createContext, useContext } from "react";
import type {
  Company,
  Host,
  ReportSettings,
  ValidationType,
} from "@/lib/types";

/**
 * Everything about the board that does NOT change when the viewed date
 * changes - fetched once in the layout rather than re-fetched by the page on
 * every date navigation.
 *
 * Splitting it out this way means switching days only ever has to wait on the
 * two queries that actually depend on the date (visits, report_runs) instead
 * of on all eight queries the page used to run in parallel.
 */
export interface BoardData {
  validationTypes: ValidationType[];
  hosts: Host[];
  companies: Company[];
  vehicleBrands: string[];
  approverNames: string[];
  settings: ReportSettings;
  editable: boolean;
  isAdmin: boolean;
}

const BoardDataContext = createContext<BoardData | null>(null);

export function BoardDataProvider({
  value,
  children,
}: {
  value: BoardData;
  children: React.ReactNode;
}) {
  return (
    <BoardDataContext.Provider value={value}>
      {children}
    </BoardDataContext.Provider>
  );
}

export function useBoardData(): BoardData {
  const ctx = useContext(BoardDataContext);
  if (!ctx) {
    throw new Error("useBoardData must be used within BoardDataProvider");
  }
  return ctx;
}
