import { NextResponse } from "next/server";

import { POST as validateCalendar } from "@/app/api/calendar/validate/route";
import { loadWebServerConfig } from "@/lib/server/config";
import { encryptSecret } from "@/lib/server/crypto";
import { updateInstallation } from "@/lib/server/installations";
import { requireSameOrigin, smallJson, WebRequestError } from "@/lib/server/request-security";
import { installationToken } from "@/lib/server/session";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    const token = await installationToken();
    if (!token) throw new WebRequestError("Conecte primeiro o Notion.", 401);
    const bodyRequest = request.clone();
    const validation = await validateCalendar(request);
    const result = (await validation.json()) as {
      events?: number;
      message?: string;
      valid?: boolean;
    };
    if (!validation.ok || !result.valid) {
      return NextResponse.json(result, {
        status: validation.status,
        headers: { "cache-control": "no-store, max-age=0" },
      });
    }
    const body = await smallJson<{ url?: unknown }>(bodyRequest);
    if (typeof body.url !== "string") throw new WebRequestError("Cole a URL do calendário.");
    const config = loadWebServerConfig();
    await updateInstallation(config, token, {
      calendarUrlEncrypted: encryptSecret(body.url.trim(), config.encryptionKey),
    });
    return NextResponse.json(
      { valid: true, saved: true, events: result.events ?? 0 },
      { headers: { "cache-control": "no-store, max-age=0" } },
    );
  } catch (error) {
    const known = error instanceof WebRequestError;
    return NextResponse.json(
      {
        valid: false,
        message: known ? error.message : "Não foi possível salvar o calendário com segurança.",
      },
      {
        status: known ? error.status : 500,
        headers: { "cache-control": "no-store, max-age=0" },
      },
    );
  }
}
