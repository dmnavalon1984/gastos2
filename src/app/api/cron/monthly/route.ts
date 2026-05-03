import { NextRequest, NextResponse } from "next/server";
import { listMovimientosMes, getPresupuestosMes, getConfig, appendMovimiento } from "@/lib/sheets";
import { generateMonthlyInsights } from "@/lib/anthropic";
import { sendMessage, formatCLP } from "@/lib/telegram";
import type { Movimiento } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron mensual — corre día 1 de cada mes.
 * Tareas:
 *  1. Inserta sueldo fijo del mes que acaba de comenzar
 *  2. Genera resumen e insights del mes anterior
 *  3. Envía todo por Telegram
 *
 * Configurar en Vercel (vercel.json) con schedule: "0 9 1 * *" (1ro de cada mes 9am UTC = 6am CLT)
 */
export async function GET(req: NextRequest) {
  // Vercel Cron protege con header automático en runtime
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const got = req.headers.get("authorization");
    if (got !== `Bearer ${cronSecret}`) {
      return new NextResponse("forbidden", { status: 403 });
    }
  }

  const now = new Date();
  const mesAnterior = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const yyyymmAnterior = mesAnterior.toISOString().slice(0, 7);

  const chatId = await getConfig("telegram_chat_id");
  if (!chatId) {
    return NextResponse.json({ error: "telegram_chat_id no configurado" }, { status: 500 });
  }

  // 1. Insertar sueldo fijo del mes que recién empieza
  await insertSueldoFijo(now);

  // 2. Generar resumen del mes anterior
  const movs = await listMovimientosMes(yyyymmAnterior);
  if (movs.length === 0) {
    await sendMessage({
      chat_id: chatId,
      text: `📅 Mes ${yyyymmAnterior} cerrado sin movimientos registrados.`,
    });
    return NextResponse.json({ ok: true, mes: yyyymmAnterior, movs: 0 });
  }

  const insights = await buildAndSendMonthlyReport(chatId, yyyymmAnterior, movs);

  return NextResponse.json({ ok: true, mes: yyyymmAnterior, movs: movs.length, insights });
}

async function insertSueldoFijo(now: Date) {
  // Lee Ingresos_Fijos y mete los activos del mes
  const { google } = await import("googleapis");
  const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const SHEET_ID = process.env.GOOGLE_SHEET_ID!;

  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "Ingresos_Fijos!A2:F",
  });
  const rows = resp.data.values || [];
  const yyyymm = now.toISOString().slice(0, 7);

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const [concepto, monto, dia, activo, ultimoMes] = r;
    if (activo !== "si") continue;
    if (ultimoMes === yyyymm) continue; // ya insertado
    const montoNum = Number(monto || 0);
    if (montoNum <= 0) continue;

    const fecha = new Date(now.getFullYear(), now.getMonth(), Number(dia || 1))
      .toISOString()
      .slice(0, 10);

    const mov: Movimiento = {
      id: "ing_" + Date.now().toString(36) + "_" + i,
      fecha,
      monto_clp: montoNum,
      tipo: "ingreso",
      banco: "Otro",
      comercio: concepto,
      categoria: "Ingreso fijo",
      raw_text: `Ingreso fijo automático: ${concepto}`,
      fuente: "manual",
      fecha_registro: new Date().toISOString(),
      conciliado_cartola: "no",
      ai_confianza: 1,
    };
    await appendMovimiento(mov);

    // Marcar último mes insertado
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `Ingresos_Fijos!E${i + 2}`,
      valueInputOption: "RAW",
      requestBody: { values: [[yyyymm]] },
    });
  }
}

async function buildAndSendMonthlyReport(
  chatId: string,
  yyyymm: string,
  movs: Movimiento[],
) {
  const gastos = movs.filter((m) => m.tipo === "gasto");
  const ingresos = movs.filter((m) => m.tipo === "ingreso");
  const totalG = gastos.reduce((a, b) => a + b.monto_clp, 0);
  const totalI = ingresos.reduce((a, b) => a + b.monto_clp, 0);

  const presupuestos = await getPresupuestosMes(yyyymm);

  const porCategoria = new Map<string, number>();
  for (const g of gastos) {
    porCategoria.set(g.categoria, (porCategoria.get(g.categoria) || 0) + g.monto_clp);
  }
  const porCatArr = [...porCategoria.entries()]
    .map(([categoria, monto]) => ({
      categoria,
      monto,
      presupuesto: presupuestos.find((p) => p.categoria === categoria)?.presupuesto || 0,
    }))
    .sort((a, b) => b.monto - a.monto);

  // Mes anterior al anterior, para comparativa
  const [y, m] = yyyymm.split("-").map(Number);
  const mesAnt = new Date(y, m - 2, 1);
  const yyyymmAnt = mesAnt.toISOString().slice(0, 7);
  const movsAnt = await listMovimientosMes(yyyymmAnt);
  const porCatAnt = new Map<string, number>();
  for (const g of movsAnt.filter((x) => x.tipo === "gasto")) {
    porCatAnt.set(g.categoria, (porCatAnt.get(g.categoria) || 0) + g.monto_clp);
  }
  const comparativa = porCatArr.map((p) => ({
    categoria: p.categoria,
    actual: p.monto,
    anterior: porCatAnt.get(p.categoria) || 0,
  }));

  // Top comercios
  const porCom = new Map<string, { monto: number; veces: number }>();
  for (const g of gastos) {
    const cur = porCom.get(g.comercio) || { monto: 0, veces: 0 };
    cur.monto += g.monto_clp;
    cur.veces += 1;
    porCom.set(g.comercio, cur);
  }
  const topComercios = [...porCom.entries()]
    .map(([comercio, v]) => ({ comercio, ...v }))
    .sort((a, b) => b.monto - a.monto)
    .slice(0, 8);

  let insights = "";
  try {
    insights = await generateMonthlyInsights({
      mes: yyyymm,
      totalGastado: totalG,
      totalIngreso: totalI,
      porCategoria: porCatArr,
      comparativaMesAnterior: comparativa,
      topComercios,
    });
  } catch (e) {
    insights = `(no se pudo generar análisis IA: ${(e as Error).message})`;
  }

  const balance = totalI - totalG;
  const dashUrl = (await getConfig("dashboard_url")) || "";
  const dashLine = dashUrl ? `\n\n🌐 Dashboard: ${dashUrl}` : "";

  const text = `📅 *Cierre de ${yyyymm}*

💸 Gastado: ${formatCLP(totalG)}
💰 Ingresos: ${formatCLP(totalI)}
${balance >= 0 ? "✅" : "🔴"} Balance: ${formatCLP(balance)}

*Top categorías:*
${porCatArr
  .slice(0, 5)
  .map(
    (p, i) =>
      `${i + 1}. ${p.categoria}: ${formatCLP(p.monto)}` +
      (p.presupuesto > 0
        ? ` (${((p.monto / p.presupuesto) * 100).toFixed(0)}% del presupuesto)`
        : ""),
  )
  .join("\n")}

🤖 *Análisis del mes:*
${insights}${dashLine}`;

  await sendMessage({ chat_id: chatId, text, parse_mode: "Markdown" });
  return insights;
}
