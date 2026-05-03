import { NextRequest, NextResponse } from "next/server";
import { clearSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  clearSession();
  return NextResponse.redirect(new URL("/login", req.url));
}
