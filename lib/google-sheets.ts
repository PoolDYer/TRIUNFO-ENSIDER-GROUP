import { OAuth2Client } from "google-auth-library";
import { AppError } from "./auth";
import { DB } from "./db";
import { googleConfig, googleConfigured, openSecret } from "./google-config";
import { report } from "./reports";
export function googleClient() {
  const c = googleConfig();
  return new OAuth2Client({
    clientId: c.clientId,
    clientSecret: c.clientSecret,
    redirectUri: c.redirectUri,
    transporterOptions: { timeout: 15000, retry: false },
  });
}
export async function googleStatus(db: DB) {
  if (!googleConfigured()) return { configured: false, connected: false };
  const c = googleConfig();
  const { rows } = await db.query(
    "SELECT client_id,refresh_token_encrypted FROM google_connection WHERE id=1",
  );
  if (!rows[0] || rows[0].client_id !== c.clientId)
    return { configured: true, connected: false };
  try {
    openSecret(rows[0].refresh_token_encrypted);
    return { configured: true, connected: true };
  } catch {
    return { configured: true, connected: false };
  }
}
type Summary = Awaited<ReturnType<typeof report>>;
type Value = string | number;
const currency = { type: "CURRENCY", pattern: '"S/ "#,##0.00' };
function tab(
  id: number,
  title: string,
  headers: string[],
  rows: Value[][],
  moneyColumns: number[],
  start: string,
  end: string,
) {
  const all: Value[][] = [
    ["TRIUNFO ENSIDER GROUP"],
    [`${start} al ${end} · Copia del reporte al generar el enlace`],
    [],
    headers,
    ...rows,
  ];
  return {
    properties: {
      sheetId: id,
      title,
      gridProperties: {
        rowCount: Math.max(all.length, 10),
        columnCount: headers.length,
        frozenRowCount: 4,
        hideGridlines: true,
      },
    },
    data: [
      {
        startRow: 0,
        startColumn: 0,
        rowData: all.map((row, index) => ({
          values: row.map((value, column) => ({
            userEnteredValue:
              typeof value === "number"
                ? { numberValue: value }
                : { stringValue: value },
            userEnteredFormat:
              index === 0
                ? { textFormat: { bold: true, fontSize: 16 } }
                : index === 1
                  ? {
                      textFormat: {
                        fontSize: 10,
                        foregroundColor: { red: 0.45, green: 0.48, blue: 0.52 },
                      },
                    }
                  : index === 3
                    ? {
                        backgroundColor: {
                          red: 0.925,
                          green: 0.408,
                          blue: 0.106,
                        },
                        textFormat: {
                          bold: true,
                          foregroundColor: { red: 1, green: 1, blue: 1 },
                        },
                        wrapStrategy: "WRAP",
                      }
                    : {
                        wrapStrategy: "WRAP",
                        ...(moneyColumns.includes(column)
                          ? { numberFormat: currency }
                          : {}),
                      },
          })),
        })),
        columnMetadata: headers.map((_, i) => ({
          pixelSize:
            i === 0 ? (id === 0 ? 430 : 125) : i === 1 && id === 1 ? 390 : 170,
        })),
      },
    ],
  };
}
export function spreadsheetPayload(summary: Summary) {
  const t = summary.totals;
  const isWeek = summary.period === "week";
  const labels: [string, number][] = [
    [isWeek ? "Facturación semanal" : "Subtotal facturación", t.billing],
    ["Ingresos en efectivo", t.cashReceipts],
    [isWeek ? "Total de Yape semanal" : "Total de Yape", t.digital],
    [
      isWeek
        ? "Total de gastos operativos diarios"
        : "Total de gastos operativos",
      t.operating,
    ],
    ["Deudas históricas", t.debt],
    ["Pérdida de productos (valor de venta)", t.productLossAmount],
    ["Total de caja", t.excelCash],
    ["Total de gastos fijos", t.fixed],
    ["Caja neta (después de gastos fijos y deudas)", t.netCash],
    ["Aperturas de caja registradas", t.opening],
    ["Depositado", t.deposits],
    ["Entregado", t.deliveries],
    ["Disponible en caja (físico calculado)", t.available],
    ["Monto cuenta corriente", t.bankIncome],
    ["Monto de retiro / disposición", t.bankWithdrawals],
    ["Total semanal de cuenta corriente", t.bankNet],
    ["Total acumulado de cuenta corriente", t.bankAccumulated],
  ];
  const period =
    { day: "Diario", week: "Semanal", month: "Mensual" }[summary.period] ??
    summary.period;
  return {
    properties: {
      title: `Triunfo Ensider · ${period} · ${summary.start} al ${summary.end}`,
      locale: "es",
      timeZone: "America/Lima",
    },
    sheets: [
      tab(
        0,
        isWeek ? "Control financiero semanal" : "Control financiero",
        ["Concepto", "Monto en soles"],
        labels.map(([l, v]) => [l, v / 100]),
        [1],
        summary.start,
        summary.end,
      ),
      tab(
        1,
        isWeek ? "Total de productos vendidos" : "Productos vendidos",
        [
          "Código",
          "Detalle de productos",
          "Stock",
          isWeek ? "Total de productos vendidos semanalmente" : "Productos vendidos",
          "Precio unitario",
          isWeek ? "Facturación semanal" : "Facturación",
        ],
        summary.items.map((i) => [
          i.code,
          i.name,
          Number(i.stock),
          Number(i.quantity),
          Number(i.unit_price) / 100,
          Number(i.total) / 100,
        ]),
        [4, 5],
        summary.start,
        summary.end,
      ),
      tab(
        2,
        "Ventas por día",
        ["Fecha", "Subtotal facturación", "Total de Yape"],
        summary.daily.map((i) => [
          i.date,
          Number(i.total) / 100,
          Number(i.digital) / 100,
        ]),
        [1, 2],
        summary.start,
        summary.end,
      ),
    ],
  };
}
export type SpreadsheetPayload = ReturnType<typeof spreadsheetPayload>;
export async function createSpreadsheet(
  accessToken: string,
  payload: SpreadsheetPayload,
  fetcher: typeof fetch = fetch,
) {
  // One request creates and fills the spreadsheet; text is never interpreted as a formula.
  const response = await fetcher(
    "https://sheets.googleapis.com/v4/spreadsheets?fields=spreadsheetId,spreadsheetUrl",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(25000),
    },
  );
  if (!response.ok) {
    if (response.status === 429)
      throw new AppError(
        "Google alcanzó su límite temporal de solicitudes. Inténtalo en unos minutos.",
        429,
      );
    if ([401, 403].includes(response.status))
      throw new AppError(
        "Google no permitió crear el reporte. Pide al dueño revisar la conexión y los permisos.",
        503,
      );
    throw new AppError(
      "Google no pudo crear la hoja. No se generó un enlace confirmado.",
      502,
    );
  }
  const data = await response.json();
  if (
    typeof data.spreadsheetId !== "string" ||
    !/^[A-Za-z0-9_-]+$/.test(data.spreadsheetId)
  )
    throw new AppError("Google no devolvió una hoja válida.", 502);
  return {
    id: data.spreadsheetId,
    url: `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`,
  };
}
export async function createConnectedSpreadsheet(
  db: DB,
  payload: SpreadsheetPayload,
) {
  const config = googleConfig();
  const { rows } = await db.query(
    "SELECT client_id,refresh_token_encrypted FROM google_connection WHERE id=1",
  );
  if (!rows[0] || rows[0].client_id !== config.clientId)
    throw new AppError(
      "El dueño debe conectar una cuenta de Google para generar reportes.",
      409,
    );
  const client = googleClient();
  client.setCredentials({
    refresh_token: openSecret(rows[0].refresh_token_encrypted),
  });
  let token: string | null | undefined;
  try {
    token = (await client.getAccessToken()).token;
  } catch {
    throw new AppError(
      "La autorización de Google venció o fue revocada. Pide al dueño volver a conectar la cuenta.",
      503,
    );
  }
  if (!token)
    throw new AppError("No se pudo autorizar la conexión con Google.", 503);
  return createSpreadsheet(token, payload);
}
