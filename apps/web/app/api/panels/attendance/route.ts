import { NextResponse } from "next/server";

import { loadWebServerConfig } from "@/lib/server/config";
import { requireSameOrigin, safeActionError, WebRequestError } from "@/lib/server/request-security";
import { installationToken } from "@/lib/server/session";
import { setupAttendance } from "@/lib/server/web-sync";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    const token = await installationToken();
    if (!token) throw new WebRequestError("Conecte novamente o Notion.", 401);
    const result = await setupAttendance(loadWebServerConfig(), token);
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const safe = safeActionError(error, "Não foi possível criar o controle de faltas. Tente novamente.");
    return NextResponse.json(
      { message: safe.message },
      { status: safe.status, headers: { "cache-control": "no-store" } },
    );
  }
}
