import { google, sheets_v4 } from "googleapis";
import type { Movimiento } from "./types";

let _sheets: sheets_v4.Sheets | null = null;

function getClient(): sheets_v4.Sheets {
  if (_sheets) return _sheets;

  const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(
    /\\n/g,
    "\n",
  );

  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  _sheets = google.sheets({ version: "v4", auth });
  return _sheets;
}

const SHEET_ID = () => process.env.GOOGLE_SHEET_ID!;

// =================== Reglas aprendidas ===================

export async function getReglasAprendidas(): Promise<
  Array<{ pattern: string; categoria: string }>
> {
  const sheets = getClient();
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID(),
    range: "Reglas_Aprendidas!A2:B",
  });
  const rows = resp.data.values || [];
  return rows
    .filter((r) => r[0] && r[1])
    .map((r) => ({ pattern: String(r[0]), categoria: String(r[1]) }));
}

export async function upsertReglaAprendida(
  pattern: string,
  categoria: string,
): Promise<void> {
  const sheets = getClient();
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID(),
    range: "Reglas_Aprendidas!A2:E",
  });
  const rows = resp.data.values || [];
  const idx = rows.findIndex((r) => String(r[0]).toUpperCase() === pattern.toUpperCase());
  const now = new Date().toISOString();

  if (idx >= 0) {
    const rowNum = idx + 2;
    const veces = Number(rows[idx][2] || 0) + 1;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID(),
      range: `Reglas_Aprendidas!B${rowNum}:E${rowNum}`,
      valueInputOption: "RAW",
      requestBody: {
        values: [[categoria, veces, now, "user"]],
      },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID(),
      range: "Reglas_Aprendidas!A:E",
      valueInputOption: "RAW",
      requestBody: {
        values: [[pattern.toUpperCase(), categoria, 1, now, "user"]],
      },
    });
  }
}

// =================== Movimientos ===================

export async function appendMovimiento(m: Movimiento): Promise<void> {
  const sheets = getClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID(),
    range: "Movimientos!A:Q",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          m.id,
          m.fecha,
          m.monto_clp,
          m.tipo,
          m.banco,
          m.comercio,
          m.categoria,
          m.subcategoria || "",
          m.metodo_pago || "",
          m.cuotas_total || 1,
          m.cuotas_pagadas || 1,
          m.raw_text,
          m.notas || "",
          m.fuente,
          m.fecha_registro,
          m.conciliado_cartola,
          m.ai_confianza,
        ],
      ],
    },
  });
}

export async function listMovimientosMes(yyyymm: string): Promise<Movimiento[]> {
  const sheets = getClient();
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID(),
    range: "Movimientos!A2:Q",
  });
  const rows = resp.data.values || [];
  return rows
    .filter((r) => r[1] && String(r[1]).startsWith(yyyymm) && !String(r[0]).startsWith("ej-"))
    .map(rowToMovimiento);
}

export async function listMovimientos(limit = 200): Promise<Movimiento[]> {
  const sheets = getClient();
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID(),
    range: "Movimientos!A2:Q",
  });
  const rows = resp.data.values || [];
  return rows
    .filter((r) => r[0] && !String(r[0]).startsWith("ej-"))
    .slice(-limit)
    .map(rowToMovimiento);
}

function rowToMovimiento(r: any[]): Movimiento {
  return {
    id: r[0],
    fecha: r[1],
    monto_clp: Number(r[2]),
    tipo: r[3],
    banco: r[4],
    comercio: r[5],
    categoria: r[6],
    subcategoria: r[7],
    metodo_pago: r[8],
    cuotas_total: r[9] ? Number(r[9]) : undefined,
    cuotas_pagadas: r[10] ? Number(r[10]) : undefined,
    raw_text: r[11] || "",
    notas: r[12],
    fuente: r[13],
    fecha_registro: r[14],
    conciliado_cartola: r[15] || "no",
    ai_confianza: r[16] ? Number(r[16]) : 0,
  };
}

// =================== Presupuestos ===================

export async function getPresupuestosMes(yyyymm: string): Promise<
  Array<{ categoria: string; presupuesto: number; gastado: number }>
> {
  const sheets = getClient();
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID(),
    range: "Presupuestos!A2:F",
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const rows = resp.data.values || [];
  return rows
    .filter((r) => r[0] === yyyymm)
    .map((r) => ({
      categoria: String(r[1]),
      presupuesto: Number(r[2] || 0),
      gastado: Number(r[3] || 0),
    }));
}

// =================== Config ===================

export async function getConfig(key: string): Promise<string | null> {
  const sheets = getClient();
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID(),
    range: "Config!A2:B",
  });
  const rows = resp.data.values || [];
  const row = rows.find((r) => r[0] === key);
  return row ? String(row[1] || "") : null;
}

export async function setConfig(key: string, value: string): Promise<void> {
  const sheets = getClient();
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID(),
    range: "Config!A2:B",
  });
  const rows = resp.data.values || [];
  const idx = rows.findIndex((r) => r[0] === key);
  if (idx >= 0) {
    const rowNum = idx + 2;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID(),
      range: `Config!B${rowNum}`,
      valueInputOption: "RAW",
      requestBody: { values: [[value]] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID(),
      range: "Config!A:C",
      valueInputOption: "RAW",
      requestBody: { values: [[key, value, ""]] },
    });
  }
}
