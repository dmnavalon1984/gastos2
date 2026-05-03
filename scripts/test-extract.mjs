#!/usr/bin/env node
/**
 * Prueba la extracción de Claude Haiku con un texto sin desplegar nada.
 * Sirve para validar el prompt antes de mandar a Vercel.
 *
 * Uso: node scripts/test-extract.mjs "Compra por $5.990 en JUMBO con tarjeta ****1234"
 */
import fs from "node:fs";
import path from "node:path";

function loadEnv() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}
loadEnv();

const text = process.argv.slice(2).join(" ");
if (!text) {
  console.error('Uso: node scripts/test-extract.mjs "texto del gasto"');
  process.exit(1);
}

const apiKey = process.env.ANTHROPIC_API_KEY;
const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

const CATEGORIAS = [
  "Comida fuera", "Supermercado", "Transporte", "Combustible",
  "Suscripciones", "Salud", "Hogar", "Ropa", "Entretenimiento",
  "Pádel", "Educación", "Regalos", "Imprevistos",
  "Ingreso fijo", "Ingreso variable",
];

const today = new Date().toISOString().slice(0, 10);

const system = `Eres un extractor de gastos chilenos. Devuelve SOLO JSON con:
{monto_clp:number, comercio:string, fecha:"YYYY-MM-DD", banco:string, metodo_pago:string, cuotas_total:number, tipo:"gasto"|"ingreso", categoria_sugerida:string, confianza:number, razonamiento:string}
Categorías válidas: ${CATEGORIAS.join(", ")}.
Hoy: ${today}. Bancos: Banco de Chile, Edwards, Falabella, Mercado Pago, BICE.`;

const res = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  },
  body: JSON.stringify({
    model,
    max_tokens: 600,
    system,
    messages: [{ role: "user", content: `Texto: """${text}"""\nDevuelve solo el JSON.` }],
  }),
});

const json = await res.json();
if (!res.ok) {
  console.error("Error:", json);
  process.exit(2);
}
const raw = json.content[0].text;
console.log("Raw:\n", raw, "\n");
const m = raw.match(/\{[\s\S]*\}/);
if (m) {
  const parsed = JSON.parse(m[0]);
  console.log("Parsed:", parsed);
}
