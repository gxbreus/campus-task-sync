import { NextResponse } from "next/server";

import { loadWebServerConfig } from "@/lib/server/config";
import { deleteInstallation } from "@/lib/server/installations";
import { requireSameOrigin, WebRequestError } from "@/lib/server/request-security";
import { INSTALLATION_COOKIE, installationToken } from "@/lib/server/session";

export const runtime = "nodejs";

export async function DELETE(request: Request): Promise<Response> {
  try {
    requireSameOrigin(request);
    const token = await installationToken();
    if (token) await deleteInstallation(loadWebServerConfig(), token);
    const response = NextResponse.json(
      { reset: true },
      { headers: { "cache-control": "no-store, max-age=0" } },
    );
    response.cookies.set(INSTALLATION_COOKIE, "", {
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secure: new URL(request.url).protocol === "https:",
    });
    return response;
  } catch (error) {
    const known = error instanceof WebRequestError;
    return NextResponse.json(
      { message: known ? error.message : "Não foi possível apagar a configuração." },
      { status: known ? error.status : 500, headers: { "cache-control": "no-store" } },
    );
  }
}
