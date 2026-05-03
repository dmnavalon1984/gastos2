/**
 * Apps Script — Procesamiento mensual de cartolas PDF y conciliación.
 *
 * Corre una vez al mes (configurar trigger: día 5 a las 7am).
 *
 * Para cada banco:
 *   1. Busca en Gmail los emails con cartolas del mes anterior
 *   2. Descarga el PDF adjunto
 *   3. Lo convierte a texto (Drive API → Google Doc → texto)
 *   4. Llama a Claude Haiku para extraer movimientos
 *   5. Compara contra Movimientos en la planilla
 *   6. Inserta los que faltan, marca los conciliados
 *   7. Anota el resultado en hoja Conciliacion
 *   8. Manda resumen al chat de Telegram
 *
 * INSTALACIÓN:
 *   1. Abre la planilla "Control de Gastos" → Extensiones → Apps Script
 *   2. Pega este archivo + setup.gs
 *   3. Configura las propiedades del proyecto (Project Settings → Script Properties):
 *        - ANTHROPIC_API_KEY
 *        - TELEGRAM_BOT_TOKEN
 *        - TELEGRAM_CHAT_ID
 *   4. Ejecuta `setupTriggers()` una vez para crear el trigger mensual
 *   5. Permite el acceso a Gmail/Drive/Sheets cuando lo pida
 */

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

const BANCOS_CONFIG = [
  {
    nombre: "Banco de Chile",
    queryGmail: 'from:(bancochile.cl OR bancoedwards.cl) subject:(cartola OR estado de cuenta OR resumen) has:attachment filename:pdf',
  },
  {
    nombre: "Edwards",
    queryGmail: 'from:bancoedwards.cl subject:(cartola OR resumen) has:attachment filename:pdf',
  },
  {
    nombre: "Falabella",
    queryGmail: 'from:(bancofalabella.cl OR falabella.com) subject:(cartola OR estado de cuenta OR resumen) has:attachment filename:pdf',
  },
  {
    nombre: "Mercado Pago",
    queryGmail: 'from:(mercadopago.com OR mercadolibre.cl) subject:(resumen OR comprobante) has:attachment filename:pdf',
  },
  {
    nombre: "BICE",
    queryGmail: 'from:bice.cl subject:(cartola OR estado de cuenta) has:attachment filename:pdf',
  },
];

/**
 * Función principal — corre el trigger mensual.
 */
function procesarCartolasMensuales() {
  const now = new Date();
  const mesAnterior = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const yyyymm = Utilities.formatDate(mesAnterior, "GMT-3", "yyyy-MM");

  let resumenTotal = `📅 *Procesando cartolas ${yyyymm}*\n\n`;

  for (const banco of BANCOS_CONFIG) {
    try {
      const r = procesarBanco(banco, mesAnterior);
      resumenTotal += `🏦 *${banco.nombre}*: ${r.cartola} en cartola, ${r.faltantes} faltantes, ${r.conciliados} conciliados\n`;
    } catch (e) {
      resumenTotal += `🏦 *${banco.nombre}*: ❌ ${e.message}\n`;
      Logger.log(`Error ${banco.nombre}: ${e.stack}`);
    }
  }

  notificarTelegram(resumenTotal);
}

function procesarBanco(banco, mesDate) {
  const yyyymm = Utilities.formatDate(mesDate, "GMT-3", "yyyy-MM");
  const after = Utilities.formatDate(
    new Date(mesDate.getFullYear(), mesDate.getMonth(), 1),
    "GMT-3",
    "yyyy/MM/dd",
  );
  const before = Utilities.formatDate(
    new Date(mesDate.getFullYear(), mesDate.getMonth() + 2, 5),
    "GMT-3",
    "yyyy/MM/dd",
  );
  const query = `${banco.queryGmail} after:${after} before:${before}`;

  const threads = GmailApp.search(query, 0, 5);
  if (threads.length === 0) {
    return { cartola: 0, faltantes: 0, conciliados: 0 };
  }

  // Buscar el primer adjunto PDF
  let pdfBlob = null;
  for (const t of threads) {
    for (const m of t.getMessages()) {
      for (const att of m.getAttachments()) {
        if (att.getContentType() === "application/pdf" && att.getName().toLowerCase().includes("")) {
          pdfBlob = att.copyBlob();
          break;
        }
      }
      if (pdfBlob) break;
    }
    if (pdfBlob) break;
  }
  if (!pdfBlob) return { cartola: 0, faltantes: 0, conciliados: 0 };

  // Convertir PDF a texto vía OCR/Drive
  const texto = pdfATexto(pdfBlob);

  // Llamar Claude Haiku para extraer movimientos
  const movimientosCartola = extraerMovimientosConHaiku(texto, banco.nombre, yyyymm);

  // Conciliar con Sheets
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName("Movimientos");
  const data = sh.getDataRange().getValues();
  const headers = data[0];

  let faltantes = 0;
  let conciliados = 0;
  const fechaProc = new Date().toISOString();

  for (const m of movimientosCartola) {
    const match = buscarMatch(data, m, banco.nombre);
    if (match) {
      // Marcar conciliado
      const rowNum = match.rowIndex + 1;
      const colConcil = headers.indexOf("conciliado_cartola") + 1;
      sh.getRange(rowNum, colConcil).setValue("si");
      conciliados++;
    } else {
      // Insertar
      sh.appendRow([
        "c_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6),
        m.fecha,
        m.monto_clp,
        m.tipo || "gasto",
        banco.nombre,
        m.comercio,
        m.categoria || "Imprevistos",
        "",
        m.metodo_pago || "",
        m.cuotas_total || 1,
        1,
        m.raw_text || "",
        "📥 Detectado por cartola — categoriza si es necesario",
        "cartola",
        fechaProc,
        "si",
        m.confianza || 0.8,
      ]);
      faltantes++;
    }
  }

  // Log en hoja Conciliacion
  const conSheet = ss.getSheetByName("Conciliacion");
  conSheet.appendRow([
    yyyymm,
    banco.nombre,
    movimientosCartola.length,
    movimientosCartola.length - faltantes,
    conciliados,
    faltantes,
    0,
    fechaProc,
    "",
  ]);

  return { cartola: movimientosCartola.length, faltantes, conciliados };
}

function pdfATexto(pdfBlob) {
  // Convertir PDF a Google Doc usando Drive API v2
  const file = Drive.Files.insert(
    {
      title: "_tmp_cartola_" + new Date().getTime(),
      mimeType: "application/pdf",
    },
    pdfBlob,
    { ocr: true, ocrLanguage: "es" },
  );

  // Esperar OCR
  Utilities.sleep(3000);

  const doc = DocumentApp.openById(file.id);
  const texto = doc.getBody().getText();

  // Limpieza
  Drive.Files.remove(file.id);

  return texto.slice(0, 30000); // tope de seguridad
}

function extraerMovimientosConHaiku(texto, banco, yyyymm) {
  const apiKey = PropertiesService.getScriptProperties().getProperty("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY en script properties");

  const system =
    "Eres un experto en extraer movimientos bancarios desde texto OCR de cartolas chilenas.\n" +
    "Devuelve SOLO JSON con la forma:\n" +
    '{ "movimientos": [{ "fecha":"YYYY-MM-DD", "monto_clp":number, "comercio":string, "tipo":"gasto"|"ingreso", "metodo_pago":string, "cuotas_total":number, "categoria":string, "confianza":number, "raw_text":string }] }\n' +
    "Categorías: Comida fuera, Supermercado, Transporte, Combustible, Suscripciones, Salud, Hogar, Ropa, Entretenimiento, Pádel, Educación, Regalos, Imprevistos, Ingreso fijo, Ingreso variable.\n" +
    "Si una línea es comisión bancaria, intereses o IVA → categoria = Imprevistos, comercio = la descripción.\n" +
    "IGNORAR pagos de tarjeta (transferencias entre cuentas propias).\n" +
    "Filtrar SOLO movimientos del mes " + yyyymm + ".";

  const body = {
    model: ANTHROPIC_MODEL,
    max_tokens: 4000,
    system,
    messages: [
      {
        role: "user",
        content: `Banco: ${banco}\n\nTexto OCR de la cartola:\n"""\n${texto}\n"""\n\nExtrae todos los movimientos del mes ${yyyymm}. Devuelve SOLO el JSON.`,
      },
    ],
  };

  const resp = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
    method: "post",
    contentType: "application/json",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  });

  if (resp.getResponseCode() !== 200) {
    throw new Error(`Anthropic ${resp.getResponseCode()}: ${resp.getContentText().slice(0, 300)}`);
  }

  const json = JSON.parse(resp.getContentText());
  const raw = json.content[0].text;
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Haiku no devolvió JSON");

  return JSON.parse(m[0]).movimientos || [];
}

function buscarMatch(data, mov, banco) {
  // data[0] = headers, data[1..] = filas
  const headers = data[0];
  const idx = (h) => headers.indexOf(h);
  const COL_FECHA = idx("fecha");
  const COL_MONTO = idx("monto_clp");
  const COL_BANCO = idx("banco");
  const COL_COMERCIO = idx("comercio");

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[COL_BANCO] !== banco) continue;
    if (Math.abs(Number(row[COL_MONTO]) - mov.monto_clp) > 1) continue;

    const fechaSheet = new Date(row[COL_FECHA]);
    const fechaCart = new Date(mov.fecha);
    const diffDias = Math.abs((fechaSheet.getTime() - fechaCart.getTime()) / 86400000);
    if (diffDias > 3) continue;

    // Fuzzy match comercio: si cualquier palabra significativa coincide
    const comSheet = String(row[COL_COMERCIO] || "").toUpperCase();
    const comCart = String(mov.comercio || "").toUpperCase();
    if (comSheet && comCart) {
      const palabrasSheet = comSheet.split(/\s+/).filter((w) => w.length > 3);
      const palabrasCart = comCart.split(/\s+/).filter((w) => w.length > 3);
      const overlap = palabrasSheet.some((w) => palabrasCart.some((wc) => wc.includes(w) || w.includes(wc)));
      if (!overlap) continue;
    }

    return { rowIndex: i, row };
  }
  return null;
}

function notificarTelegram(text) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty("TELEGRAM_BOT_TOKEN");
  const chatId = props.getProperty("TELEGRAM_CHAT_ID");
  if (!token || !chatId) return;
  UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    muteHttpExceptions: true,
  });
}
