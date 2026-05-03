import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_EXTRACT } from "./prompts";
import type { ExtractedExpense } from "./types";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

/**
 * Extrae datos estructurados desde un texto (notificación reenviada,
 * mensaje libre, transcripción de audio).
 */
export async function extractFromText(
  text: string,
  reglasAprendidas: Array<{ pattern: string; categoria: string }>,
  todayISO: string,
): Promise<ExtractedExpense> {
  const reglasText =
    reglasAprendidas.length === 0
      ? "(sin reglas aprendidas todavía)"
      : reglasAprendidas
          .map((r) => `- "${r.pattern}" → ${r.categoria}`)
          .join("\n");

  const system = SYSTEM_EXTRACT.replace("{{REGLAS_APRENDIDAS}}", reglasText);

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    system,
    messages: [
      {
        role: "user",
        content: `Hoy es ${todayISO}.\n\nMensaje del usuario:\n"""\n${text}\n"""\n\nDevuelve SOLO el JSON.`,
      },
    ],
  });

  return parseJSONResponse(resp);
}

/**
 * Extrae datos desde una imagen (screenshot de notificación).
 */
export async function extractFromImage(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif",
  reglasAprendidas: Array<{ pattern: string; categoria: string }>,
  todayISO: string,
): Promise<ExtractedExpense> {
  const reglasText =
    reglasAprendidas.length === 0
      ? "(sin reglas aprendidas todavía)"
      : reglasAprendidas
          .map((r) => `- "${r.pattern}" → ${r.categoria}`)
          .join("\n");

  const system = SYSTEM_EXTRACT.replace("{{REGLAS_APRENDIDAS}}", reglasText);

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    system,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: imageBase64,
            },
          },
          {
            type: "text",
            text: `Hoy es ${todayISO}. Esta es una imagen de la notificación bancaria. Extrae los datos y devuelve SOLO el JSON.`,
          },
        ],
      },
    ],
  });

  return parseJSONResponse(resp);
}

/**
 * Análisis mensual con insights de IA.
 */
export async function generateMonthlyInsights(payload: {
  mes: string;
  totalGastado: number;
  totalIngreso: number;
  porCategoria: Array<{ categoria: string; monto: number; presupuesto: number }>;
  comparativaMesAnterior: Array<{ categoria: string; actual: number; anterior: number }>;
  topComercios: Array<{ comercio: string; monto: number; veces: number }>;
}): Promise<string> {
  const { SYSTEM_INSIGHTS_MENSUAL } = await import("./prompts");

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 800,
    system: SYSTEM_INSIGHTS_MENSUAL,
    messages: [
      {
        role: "user",
        content: `Datos del mes ${payload.mes}:\n\n${JSON.stringify(payload, null, 2)}\n\nGenera el análisis.`,
      },
    ],
  });

  const block = resp.content[0];
  return block.type === "text" ? block.text : "";
}

function parseJSONResponse(resp: Anthropic.Message): ExtractedExpense {
  const block = resp.content[0];
  const raw = block.type === "text" ? block.text : "";
  // Extrae el primer bloque JSON aunque venga rodeado de markdown
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(`Haiku no devolvió JSON parseable. Respuesta: ${raw}`);
  }
  return JSON.parse(match[0]) as ExtractedExpense;
}
