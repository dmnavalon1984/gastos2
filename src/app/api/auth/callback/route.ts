import { NextRequest, NextResponse } from "next/server";
import { setSession, isAllowed } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/login?error=no_code", req.url));
  }

  const baseUrl = process.env.NEXTAUTH_URL || process.env.APP_BASE_URL;
  const redirect = `${baseUrl}/api/auth/callback`;

  // Cambiar code por token
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
    redirect_uri: redirect,
    grant_type: "authorization_code",
  });

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL("/login?error=token_exchange_failed", req.url));
  }
  const { access_token } = await tokenRes.json();

  // Pedir userinfo
  const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { authorization: `Bearer ${access_token}` },
  });
  if (!userRes.ok) {
    return NextResponse.redirect(new URL("/login?error=userinfo_failed", req.url));
  }
  const user = await userRes.json();

  if (!isAllowed(user.email)) {
    return NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent("Solo el dueño del bot puede entrar.")}`,
        req.url,
      ),
    );
  }

  setSession(user.email);
  return NextResponse.redirect(new URL("/", req.url));
}
