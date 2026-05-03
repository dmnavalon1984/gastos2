/**
 * Auth simple por cookie firmada con NEXTAUTH_SECRET.
 * El usuario hace OAuth con Google directamente (sin librería),
 * validamos email contra ALLOWED_EMAIL, y firmamos un JWT propio.
 *
 * Mantengo esto a propósito sin next-auth para no inflar dependencias.
 */
import { cookies } from "next/headers";
import crypto from "crypto";

const COOKIE_NAME = "gastos2_session";
const SECRET = () => process.env.NEXTAUTH_SECRET || "dev-secret-change-me";
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 días

function sign(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", SECRET())
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

function verify(token: string): { email: string; exp: number } | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto
    .createHmac("sha256", SECRET())
    .update(body)
    .digest("base64url");
  if (expected !== sig) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString());
    if (data.exp && data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

export function setSession(email: string) {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const token = sign({ email, exp });
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: TTL_SECONDS,
    path: "/",
  });
}

export function clearSession() {
  cookies().delete(COOKIE_NAME);
}

export function getSession(): { email: string } | null {
  const c = cookies().get(COOKIE_NAME);
  if (!c?.value) return null;
  return verify(c.value);
}

export function isAllowed(email: string): boolean {
  const allowed = process.env.ALLOWED_EMAIL;
  return !!allowed && email.toLowerCase() === allowed.toLowerCase();
}
