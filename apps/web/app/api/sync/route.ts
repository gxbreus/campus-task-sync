import { NextResponse } from "next/server";

import { loadWebServerConfig } from "@/lib/server/config";
import { requireSameOrigin, WebRequestError } from "@/lib/server/request-security";
import { installationToken } from "@/lib/server/session";
import { synchronize } from "@/lib/server/web-sync";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    const token = await installationToken();
    if (!token) throw new WebRequestError("Conecte novamente o Notion.", 401);
    const result = await synchronize(loadWebServerConfig(), token);
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const known = error instanceof WebRequestError;
    return NextResponse.json(
      { message: known ? error.message : "Não foi possível sincronizar. Tente novamente." },
      { status: known ? error.status : 500, headers: { "cache-control": "no-store" } },
    );
  }
}
