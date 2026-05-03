import { NextRequest, NextResponse } from "next/server";
import {
  sendMessage,
  editMessageText,
  answerCallbackQuery,
  getFile,
  downloadFile,
  formatCLP,
} from "@/lib/telegram";
import { extractFromText, extractFromImage } from "@/lib/anthropic";
import { transcribeAudio } from "@/lib/groq";
import {
  appendMovimiento,
  getReglasAprendidas,
  upsertReglaAprendida,
  setConfig,
  getConfig,
} from "@/lib/sheets";
import {
  savePending,
  getPending,
  deletePending,
  updatePendingCategoria,
} from "@/lib/pending";
import { CATEGORIAS, type Movimiento } from "@/lib/types";
import { checkBudgetAlert } from "@/lib/budget-alerts";

// Vercel: este endpoint debe ser público (lo llama Telegram)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Validar el secret del webhook (Telegram lo manda en el header)
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const got = req.headers.get("x-telegram-bot-api-secret-token");
  if (expected && got !== expected) {
    return new NextResponse("forbidden", { status: 403 });
  }

  let update: any;
  try {
    update = await req.json();
  } catch {
    return new NextResponse("bad json", { status: 400 });
  }

  // Despacha en background y responde 200 rápido (Telegram impone timeout)
  processUpdate(update).catch((err) => {
    console.error("[telegram] Error procesando update:", err);
    const chatId = update?.message?.chat?.id || update?.callback_query?.from?.id;
    if (chatId) {
      sendMessage({
        chat_id: chatId,
        text: `❌ Error interno: ${err.message || err}`,
      }).catch(() => {});
    }
  });

  return NextResponse.json({ ok: true });
}

async function processUpdate(update: any) {
  if (update.message) {
    await handleMessage(update.message);
  } else if (update.callback_query) {
    await handleCallback(update.callback_query);
  }
}

// =================== Mensajes ===================

async function handleMessage(msg: any) {
  const chatId = msg.chat.id;
  const text: string | undefined = msg.text || msg.caption;

  // Restringir a tu chat (después del primer mensaje)
  const allowed = process.env.TELEGRAM_ALLOWED_CHAT_ID;
  if (allowed && String(allowed) !== String(chatId)) {
    await sendMessage({
      chat_id: chatId,
      text: "🔒 Bot privado. No estás autorizado.",
    });
    return;
  }

  // Si TELEGRAM_ALLOWED_CHAT_ID no está configurado, lo guardamos automáticamente
  if (!allowed) {
    try {
      await setConfig("telegram_chat_id", String(chatId));
      await sendMessage({
        chat_id: chatId,
        text: `✅ Chat autorizado: \`${chatId}\`\n\n⚠️ Configura esta variable en Vercel:\n\`TELEGRAM_ALLOWED_CHAT_ID=${chatId}\`\n\nMientras tanto, ya puedes mandarme gastos.`,
        parse_mode: "Markdown",
      });
    } catch (e) {
      console.error("No se pudo guardar chat_id:", e);
    }
  }

  // Comandos slash
  if (text?.startsWith("/")) {
    return handleCommand(chatId, text, msg);
  }

  // Determinar tipo de input: texto, foto, audio
  if (msg.photo && msg.photo.length > 0) {
    return handlePhoto(chatId, msg);
  }
  if (msg.voice || msg.audio) {
    return handleAudio(chatId, msg);
  }
  if (text) {
    return handleText(chatId, text, msg.message_id);
  }

  await sendMessage({
    chat_id: chatId,
    text: "🤔 No reconozco ese tipo de mensaje. Mándame texto, foto o audio.",
  });
}

async function handleCommand(chatId: number, text: string, msg: any) {
  const cmd = text.split(" ")[0].toLowerCase();
  switch (cmd) {
    case "/start":
      await sendMessage({
        chat_id: chatId,
        text: `👋 Hola Diego! Soy tu bot de control de gastos.

Mándame:
• 📝 *Texto* — reenvía la notificación del banco o escribe libre ("almorcé 12.500")
• 📸 *Foto* — screenshot de la app del banco
• 🎤 *Audio* — mensaje de voz hablando el gasto

Yo extraigo monto, comercio y fecha, sugiero categoría con IA, y te pido que confirmes con un botón.

Comandos:
/resumen — gastos del mes en curso
/presupuesto — estado de tus presupuestos
/help — esta ayuda
/chatid — muestra tu chat ID`,
        parse_mode: "Markdown",
      });
      return;
    case "/help":
      await handleCommand(chatId, "/start", msg);
      return;
    case "/chatid":
      await sendMessage({
        chat_id: chatId,
        text: `Tu chat_id es: \`${chatId}\``,
        parse_mode: "Markdown",
      });
      return;
    case "/resumen":
      await handleResumen(chatId);
      return;
    case "/presupuesto":
      await handlePresupuesto(chatId);
      return;
    default:
      await sendMessage({
        chat_id: chatId,
        text: `Comando desconocido: ${cmd}`,
      });
  }
}

async function handleResumen(chatId: number) {
  const yyyymm = new Date().toISOString().slice(0, 7);
  const { listMovimientosMes } = await import("@/lib/sheets");
  const movs = await listMovimientosMes(yyyymm);
  const gastos = movs.filter((m) => m.tipo === "gasto");
  const ingresos = movs.filter((m) => m.tipo === "ingreso");
  const totalG = gastos.reduce((a, b) => a + b.monto_clp, 0);
  const totalI = ingresos.reduce((a, b) => a + b.monto_clp, 0);
  const balance = totalI - totalG;

  // top 5 categorías
  const porCat = new Map<string, number>();
  for (const g of gastos) porCat.set(g.categoria, (porCat.get(g.categoria) || 0) + g.monto_clp);
  const top = [...porCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const dashUrl = (await getConfig("dashboard_url")) || "";
  const dashLine = dashUrl ? `\n\n🌐 Dashboard completo: ${dashUrl}` : "";

  await sendMessage({
    chat_id: chatId,
    parse_mode: "Markdown",
    text: `📊 *Resumen ${yyyymm}*

💸 Gastado: ${formatCLP(totalG)}
💰 Ingresos: ${formatCLP(totalI)}
${balance >= 0 ? "✅" : "🔴"} Balance: ${formatCLP(balance)}

*Top categorías:*
${top.map(([c, m], i) => `${i + 1}. ${c}: ${formatCLP(m)}`).join("\n") || "(sin gastos aún)"}${dashLine}`,
  });
}

async function handlePresupuesto(chatId: number) {
  const yyyymm = new Date().toISOString().slice(0, 7);
  const { getPresupuestosMes } = await import("@/lib/sheets");
  const ps = await getPresupuestosMes(yyyymm);
  if (ps.length === 0) {
    await sendMessage({
      chat_id: chatId,
      text: `No hay presupuestos definidos para ${yyyymm}. Edítalos en la planilla.`,
    });
    return;
  }
  const lines = ps
    .filter((p) => p.presupuesto > 0)
    .map((p) => {
      const pct = p.gastado / p.presupuesto;
      const bar = renderBar(pct);
      const ico = pct >= 1 ? "🚨" : pct >= 0.8 ? "⚠️" : "✅";
      return `${ico} *${p.categoria}* — ${(pct * 100).toFixed(0)}%\n${bar} ${formatCLP(p.gastado)} / ${formatCLP(p.presupuesto)}`;
    })
    .join("\n\n");
  await sendMessage({
    chat_id: chatId,
    parse_mode: "Markdown",
    text: `🎯 *Presupuestos ${yyyymm}*\n\n${lines}`,
  });
}

function renderBar(pct: number): string {
  const n = Math.min(10, Math.max(0, Math.round(pct * 10)));
  return "█".repeat(n) + "░".repeat(10 - n);
}

// =================== Procesamiento de gastos ===================

async function handleText(chatId: number, text: string, replyTo: number) {
  await processExtraction(chatId, text, replyTo, "text");
}

async function handlePhoto(chatId: number, msg: any) {
  const photos = msg.photo as Array<{ file_id: string; width: number; height: number }>;
  const largest = photos[photos.length - 1];
  const file = await getFile(largest.file_id);
  const buf = await downloadFile(file.file_path);
  const base64 = buf.toString("base64");
  const mediaType = file.file_path.endsWith(".png") ? "image/png" : "image/jpeg";

  await sendMessage({
    chat_id: chatId,
    text: "📸 Recibí la imagen, leyendo con IA...",
    reply_to_message_id: msg.message_id,
  });

  const reglas = await getReglasAprendidas();
  const today = new Date().toISOString().slice(0, 10);
  const data = await extractFromImage(base64, mediaType, reglas, today);
  const rawText = msg.caption || "(imagen)";
  await presentExtraction(chatId, msg.message_id, data, rawText);
}

async function handleAudio(chatId: number, msg: any) {
  const audio = msg.voice || msg.audio;
  await sendMessage({
    chat_id: chatId,
    text: "🎤 Recibí el audio, transcribiendo...",
    reply_to_message_id: msg.message_id,
  });

  const file = await getFile(audio.file_id);
  const buf = await downloadFile(file.file_path);
  const filename = audio.mime_type?.includes("ogg") ? "audio.ogg" : "audio.mp3";
  const transcript = await transcribeAudio(buf, filename);

  await sendMessage({
    chat_id: chatId,
    text: `🗣️ Transcripción:\n_${transcript}_\n\nProcesando...`,
    parse_mode: "Markdown",
  });

  await processExtraction(chatId, transcript, msg.message_id, "audio");
}

async function processExtraction(
  chatId: number,
  text: string,
  replyTo: number,
  _kind: "text" | "audio",
) {
  const reglas = await getReglasAprendidas();
  const today = new Date().toISOString().slice(0, 10);
  const data = await extractFromText(text, reglas, today);
  await presentExtraction(chatId, replyTo, data, text);
}

async function presentExtraction(
  chatId: number,
  replyTo: number,
  data: any,
  rawText: string,
) {
  if (data.confianza < 0.4) {
    await sendMessage({
      chat_id: chatId,
      text: `🤔 No pude entender el gasto bien (confianza ${(data.confianza * 100).toFixed(0)}%).
Razón IA: _${data.razonamiento}_

Intenta reenviarme el texto completo de la notificación, una foto del banco, o un mensaje libre tipo:
"almorzé en restaurante peruano 18.500"`,
      parse_mode: "Markdown",
      reply_to_message_id: replyTo,
    });
    return;
  }

  const id = "p_" + Math.random().toString(36).slice(2, 10);
  await savePending({
    id,
    data,
    raw_text: rawText,
    created_at: new Date().toISOString(),
  });

  const cuotasLine = (data.cuotas_total || 1) > 1 ? `\n💳 ${data.cuotas_total} cuotas` : "";
  const tipoIco = data.tipo === "ingreso" ? "💰" : "💸";

  await sendMessage({
    chat_id: chatId,
    parse_mode: "Markdown",
    reply_to_message_id: replyTo,
    text: `${tipoIco} *${formatCLP(data.monto_clp)}* en *${escapeMd(data.comercio)}*
🏦 ${data.banco} · 📅 ${data.fecha}${cuotasLine}
🏷️ Categoría: *${data.categoria_sugerida}*
_(confianza ${(data.confianza * 100).toFixed(0)}%)_`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ Confirmar", callback_data: `ok:${id}` },
          { text: "✏️ Cambiar categoría", callback_data: `cat:${id}` },
        ],
        [{ text: "❌ Descartar", callback_data: `no:${id}` }],
      ],
    },
  });
}

function escapeMd(s: string) {
  return s.replace(/([_*[\]`])/g, "\\$1");
}

// =================== Callback queries (botones) ===================

async function handleCallback(cq: any) {
  const data: string = cq.data;
  const chatId = cq.message.chat.id;
  const msgId = cq.message.message_id;
  const [action, id, ...rest] = data.split(":");

  await answerCallbackQuery(cq.id);

  switch (action) {
    case "ok":
      await confirmPending(chatId, msgId, id);
      return;
    case "cat":
      await showCategoryMenu(chatId, msgId, id);
      return;
    case "setcat": {
      const newCat = rest.join(":");
      await updatePendingCategoria(id, newCat);
      const p = await getPending(id);
      if (p) {
        await editMessageText({
          chat_id: chatId,
          message_id: msgId,
          parse_mode: "Markdown",
          text: `${p.data.tipo === "ingreso" ? "💰" : "💸"} *${formatCLP(p.data.monto_clp)}* en *${escapeMd(p.data.comercio)}*
🏦 ${p.data.banco} · 📅 ${p.data.fecha}
🏷️ Categoría: *${newCat}* _(elegida por ti)_`,
          reply_markup: {
            inline_keyboard: [
              [
                { text: "✅ Confirmar", callback_data: `ok:${id}` },
                { text: "✏️ Cambiar de nuevo", callback_data: `cat:${id}` },
              ],
              [{ text: "❌ Descartar", callback_data: `no:${id}` }],
            ],
          },
        });
      }
      return;
    }
    case "no":
      await deletePending(id);
      await editMessageText({
        chat_id: chatId,
        message_id: msgId,
        text: "❌ Descartado.",
      });
      return;
    case "back":
      await renderConfirmation(chatId, msgId, id);
      return;
  }
}

async function showCategoryMenu(chatId: number, msgId: number, id: string) {
  const p = await getPending(id);
  if (!p) return;
  const buttons = CATEGORIAS.filter((c) => !c.startsWith("Ingreso") || p.data.tipo === "ingreso");
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  for (let i = 0; i < buttons.length; i += 2) {
    const row = buttons.slice(i, i + 2).map((c) => ({
      text: c === p.data.categoria_sugerida ? `✅ ${c}` : c,
      callback_data: `setcat:${id}:${c}`,
    }));
    rows.push(row);
  }
  rows.push([{ text: "← Volver", callback_data: `back:${id}` }]);

  await editMessageText({
    chat_id: chatId,
    message_id: msgId,
    parse_mode: "Markdown",
    text: `Elige categoría para *${escapeMd(p.data.comercio)}* (${formatCLP(p.data.monto_clp)})`,
    reply_markup: { inline_keyboard: rows },
  });
}

async function renderConfirmation(chatId: number, msgId: number, id: string) {
  const p = await getPending(id);
  if (!p) return;
  await editMessageText({
    chat_id: chatId,
    message_id: msgId,
    parse_mode: "Markdown",
    text: `${p.data.tipo === "ingreso" ? "💰" : "💸"} *${formatCLP(p.data.monto_clp)}* en *${escapeMd(p.data.comercio)}*
🏦 ${p.data.banco} · 📅 ${p.data.fecha}
🏷️ Categoría: *${p.data.categoria_sugerida}*`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ Confirmar", callback_data: `ok:${id}` },
          { text: "✏️ Cambiar categoría", callback_data: `cat:${id}` },
        ],
        [{ text: "❌ Descartar", callback_data: `no:${id}` }],
      ],
    },
  });
}

async function confirmPending(chatId: number, msgId: number, id: string) {
  const p = await getPending(id);
  if (!p) {
    await editMessageText({
      chat_id: chatId,
      message_id: msgId,
      text: "❌ Esta confirmación ya no está disponible.",
    });
    return;
  }

  const mov: Movimiento = {
    id: "m_" + Date.now().toString(36),
    fecha: p.data.fecha,
    monto_clp: p.data.monto_clp,
    tipo: p.data.tipo,
    banco: p.data.banco,
    comercio: p.data.comercio,
    categoria: p.data.categoria_sugerida as any,
    metodo_pago: p.data.metodo_pago,
    cuotas_total: p.data.cuotas_total || 1,
    cuotas_pagadas: 1,
    raw_text: p.raw_text,
    fuente: "telegram",
    fecha_registro: new Date().toISOString(),
    conciliado_cartola: "no",
    ai_confianza: p.data.confianza,
  };

  await appendMovimiento(mov);
  await upsertReglaAprendida(p.data.comercio, p.data.categoria_sugerida);
  await deletePending(id);

  // Edit the original message
  await editMessageText({
    chat_id: chatId,
    message_id: msgId,
    parse_mode: "Markdown",
    text: `✅ Registrado: ${formatCLP(mov.monto_clp)} · *${escapeMd(mov.comercio)}* · ${mov.categoria}`,
  });

  // Check budget alert (only for gastos, not ingresos)
  if (mov.tipo === "gasto") {
    const yyyymm = mov.fecha.slice(0, 7);
    const alert = await checkBudgetAlert(mov.categoria, yyyymm);
    if (alert) {
      await sendMessage({
        chat_id: chatId,
        text: alert,
        parse_mode: "Markdown",
      });
    }
  }
}

// GET para healthcheck / verificación manual
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "telegram webhook",
    time: new Date().toISOString(),
  });
}
