/**
 * Almacén temporal de gastos "pendientes de confirmación".
 *
 * Cuando el usuario manda una notificación, el bot extrae los datos pero NO los
 * escribe en Sheets hasta que confirme. Mientras tanto, los datos viven en una
 * fila de la hoja "Pending" (clave = callback_id corto).
 *
 * No usamos memoria del proceso porque Vercel es serverless: cada request es
 * potencialmente un proceso nuevo.
 */

import { google, sheets_v4 } from "googleapis";
import type { ExtractedExpense } from "./types";

let _sheets: sheets_v4.Sheets | null = null;
function getClient(): sheets_v4.Sheets {
  if (_sheets) return _sheets;
  const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  _sheets = google.sheets({ version: "v4", auth });
  return _sheets;
}

const SHEET_ID = () => process.env.GOOGLE_SHEET_ID!;
const RANGE = "Pending!A2:D";

export interface Pending {
  id: string;
  data: ExtractedExpense;
  raw_text: string;
  created_at: string;
}

/** Asegura que la hoja "Pending" exista (idempotente) */
export async function ensurePendingSheet(): Promise<void> {
  const sheets = getClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID() });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === "Pending");
  if (exists) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID(),
    requestBody: {
      requests: [{ addSheet: { properties: { title: "Pending" } } }],
    },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID(),
    range: "Pending!A1:D1",
    valueInputOption: "RAW",
    requestBody: { values: [["id", "data_json", "raw_text", "created_at"]] },
  });
}

export async function savePending(p: Pending): Promise<void> {
  await ensurePendingSheet();
  const sheets = getClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID(),
    range: "Pending!A:D",
    valueInputOption: "RAW",
    requestBody: {
      values: [[p.id, JSON.stringify(p.data), p.raw_text, p.created_at]],
    },
  });
}

export async function getPending(id: string): Promise<Pending | null> {
  const sheets = getClient();
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID(),
    range: RANGE,
  });
  const rows = resp.data.values || [];
  const idx = rows.findIndex((r) => r[0] === id);
  if (idx < 0) return null;
  const r = rows[idx];
  return {
    id: r[0],
    data: JSON.parse(r[1]),
    raw_text: r[2] || "",
    created_at: r[3] || "",
  };
}

export async function deletePending(id: string): Promise<void> {
  const sheets = getClient();
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID(),
    range: RANGE,
  });
  const rows = resp.data.values || [];
  const idx = rows.findIndex((r) => r[0] === id);
  if (idx < 0) return;
  // Limpia la fila (Sheets no permite borrar filas individuales fácilmente vía values API,
  // así que vaciamos el contenido — el row queda vacío y se puede limpiar manualmente)
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID(),
    range: `Pending!A${idx + 2}:D${idx + 2}`,
    valueInputOption: "RAW",
    requestBody: { values: [["", "", "", ""]] },
  });
}

export async function updatePendingCategoria(id: string, categoria: string): Promise<void> {
  const p = await getPending(id);
  if (!p) return;
  p.data.categoria_sugerida = categoria as any;
  const sheets = getClient();
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID(),
    range: RANGE,
  });
  const rows = resp.data.values || [];
  const idx = rows.findIndex((r) => r[0] === id);
  if (idx < 0) return;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID(),
    range: `Pending!B${idx + 2}`,
    valueInputOption: "RAW",
    requestBody: { values: [[JSON.stringify(p.data)]] },
  });
}
