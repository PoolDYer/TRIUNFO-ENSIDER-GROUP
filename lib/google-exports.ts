import { randomUUID } from "node:crypto";
import { AppError, User } from "./auth";
import { DB } from "./db";
import {
  createConnectedSpreadsheet,
  SpreadsheetPayload,
  spreadsheetPayload,
} from "./google-sheets";
import { report } from "./reports";
import { periodRange } from "./validation";
import { reportForRole } from "./report-access";
type Transaction = <T>(fn: (db: DB) => Promise<T>) => Promise<T>;
export async function exportGoogleReport(
  db: DB,
  transaction: Transaction,
  user: User,
  input: { id: string; date: string; period: "day" | "week" | "month" },
  create: (
    payload: SpreadsheetPayload,
  ) => Promise<{ id: string; url: string }> = (payload) =>
    createConnectedSpreadsheet(db, payload),
) {
  const { id, date, period } = input;
  const claim = await db.query(
    "INSERT INTO google_exports(id,user_id,date,period,status) VALUES($1,$2,$3,$4,'PENDING') ON CONFLICT(id) DO NOTHING RETURNING id",
    [id, user.id, date, period],
  );
  if (!claim.rows.length) {
    const previous = (
      await db.query(
        "SELECT *,date::text AS requested_date FROM google_exports WHERE id=$1",
        [id],
      )
    ).rows[0];
    if (
      !previous ||
      previous.user_id !== user.id ||
      previous.requested_date !== date ||
      previous.period !== period
    )
      throw new AppError(
        "La solicitud de reporte no corresponde a esta operación.",
        409,
      );
    if (previous.status === "READY")
      return { url: previous.spreadsheet_url, id: previous.spreadsheet_id };
    throw new AppError(
      previous.status === "PENDING"
        ? "El reporte está en proceso. Espera antes de generar otro."
        : "La solicitud anterior no terminó correctamente. Inicia una nueva generación.",
      409,
    );
  }
  try {
    const { start, end } = periodRange(date, period);
    const summary = await transaction(async (c) => {
      await c.query(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
      );
      return report(c, start, end, period);
    });
    const result = await create(spreadsheetPayload(reportForRole(summary,user.role)));
    await transaction(async (c) => {
      await c.query(
        "UPDATE google_exports SET status='READY',spreadsheet_id=$2,spreadsheet_url=$3 WHERE id=$1",
        [id, result.id, result.url],
      );
      await c.query(
        "INSERT INTO audit_log(id,user_id,action,entity_id) VALUES($1,$2,$3,$4)",
        [randomUUID(), user.id, "googleExport", id],
      );
    });
    return result;
  } catch (error) {
    await db.query(
      "UPDATE google_exports SET status='FAILED' WHERE id=$1 AND status='PENDING'",
      [id],
    );
    throw error;
  }
}
