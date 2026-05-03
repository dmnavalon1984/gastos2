import Groq from "groq-sdk";

// Lazy init: el cliente se crea on-demand, no al cargar el módulo.
let _client: Groq | null = null;
function getClient(): Groq {
  if (_client) return _client;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY no configurada");
  _client = new Groq({ apiKey });
  return _client;
}

const MODEL = () => process.env.GROQ_AUDIO_MODEL || "whisper-large-v3-turbo";

/**
 * Transcribe un audio (Buffer de OGG, MP3, M4A, etc.) usando Groq Whisper.
 * Retorna el texto en español.
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  filename = "audio.ogg",
): Promise<string> {
  // Groq SDK acepta File-like objects en Node 20+.
  // Crear un ArrayBuffer "puro" (no ArrayBufferLike) para satisfacer BlobPart
  // bajo TypeScript estricto: el TS lib de DOM marca SharedArrayBuffer como
  // incompatible con BlobPart. Copiamos los bytes a un buffer nuevo.
  const arrayBuffer = new ArrayBuffer(audioBuffer.byteLength);
  new Uint8Array(arrayBuffer).set(audioBuffer);
  const file = new File([arrayBuffer], filename, {
    type: filename.endsWith(".ogg") ? "audio/ogg" : "audio/mpeg",
  });

  const resp = await getClient().audio.transcriptions.create({
    file,
    model: MODEL(),
    language: "es",
    response_format: "json",
  });

  return resp.text.trim();
}
