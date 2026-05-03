/**
 * Cliente del API de Telegram (sin SDK, fetch directo).
 */

const TOKEN = () => process.env.TELEGRAM_BOT_TOKEN!;
const API = () => `https://api.telegram.org/bot${TOKEN()}`;
const FILE_API = () => `https://api.telegram.org/file/bot${TOKEN()}`;

type SendMessageOpts = {
  chat_id: number | string;
  text: string;
  parse_mode?: "Markdown" | "HTML" | "MarkdownV2";
  reply_to_message_id?: number;
  reply_markup?: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };
};

export async function sendMessage(opts: SendMessageOpts) {
  const res = await fetch(`${API()}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(opts),
  });
  if (!res.ok) throw new Error(`Telegram sendMessage: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function editMessageText(opts: {
  chat_id: number | string;
  message_id: number;
  text: string;
  parse_mode?: "Markdown" | "HTML" | "MarkdownV2";
  reply_markup?: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };
}) {
  const res = await fetch(`${API()}/editMessageText`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(opts),
  });
  if (!res.ok) throw new Error(`Telegram editMessageText: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function answerCallbackQuery(callback_query_id: string, text?: string) {
  await fetch(`${API()}/answerCallbackQuery`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ callback_query_id, text }),
  });
}

export async function getFile(file_id: string): Promise<{ file_path: string }> {
  const res = await fetch(`${API()}/getFile?file_id=${file_id}`);
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram getFile: ${JSON.stringify(json)}`);
  return json.result;
}

export async function downloadFile(file_path: string): Promise<Buffer> {
  const res = await fetch(`${FILE_API()}/${file_path}`);
  if (!res.ok) throw new Error(`Telegram downloadFile: ${res.status}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

export function escapeMarkdown(text: string): string {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

export function formatCLP(n: number): string {
  return "$" + n.toLocaleString("es-CL");
}
