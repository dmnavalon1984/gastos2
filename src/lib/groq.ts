import Groq from "groq-sdk";

const client = new Groq({ apiKey: process.env.GROQ_API_KEY! });
const MODEL = process.env.GROQ_AUDIO_MODEL || "whisper-large-v3-turbo";

/**
 * Transcribe un audio (Buffer de OGG, MP3, M4A, etc.) usando Groq Whisper.
 * Retorna el texto en español.
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  filename = "audio.ogg",
): Promise<string> {
  // Groq SDK acepta File-like objects en Node 20+
  // Convertir Buffer → Uint8Array para compatibilidad con BlobPart en TS estricto
  const u8 = new Uint8Array(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.byteLength);
  const file = new File([u8], filename, {
    type: filename.endsWith(".ogg") ? "audio/ogg" : "audio/mpeg",
  });

  const resp = await client.audio.transcriptions.create({
    file,
    model: MODEL,
    language: "es",
    response_format: "json",
  });

  return resp.text.trim();
}
