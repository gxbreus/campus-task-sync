import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { loadWebServerConfig } from "@/lib/server/config";
import { synchronizeReadyInstallations } from "@/lib/server/web-sync";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(received: string | null, expected: string): boolean {
  if (!received?.startsWith("Bearer ")) return false;
  const token = Buffer.from(received.slice(7), "utf8");
  const secret = Buffer.from(expected, "utf8");
  return token.length === secret.length && timingSafeEqual(token, secret);
}

export async function POST(request: Request): Promise<Response> {
  const config = loadWebServerConfig();
  if (!config.syncCronSecret) {
    return NextResponse.json({ message: "Agendador ainda não configurado." }, { status: 503 });
  }
  if (!authorized(request.headers.get("authorization"), config.syncCronSecret)) {
    return NextResponse.json({ message: "Não autorizado." }, { status: 401 });
  }
  const result = await synchronizeReadyInstallations(config);
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}
