#!/usr/bin/env node
/**
 * Configura el webhook de Telegram apuntando al deploy de Vercel.
 *
 * Uso:
 *   1) Copia .env.local con TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET y APP_BASE_URL
 *   2) node scripts/set-telegram-webhook.mjs
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

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const baseUrl = process.env.APP_BASE_URL;

if (!token || !secret || !baseUrl) {
  console.error("Faltan env: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, APP_BASE_URL");
  process.exit(1);
}

const webhookUrl = `${baseUrl.replace(/\/$/, "")}/api/telegram/webhook`;

const params = new URLSearchParams({
  url: webhookUrl,
  secret_token: secret,
  drop_pending_updates: "true",
  allowed_updates: JSON.stringify(["message", "callback_query"]),
});

const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook?${params}`);
const json = await res.json();
console.log(JSON.stringify(json, null, 2));

// Verificar
const info = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
console.log("\nWebhook info:");
console.log(JSON.stringify(await info.json(), null, 2));
