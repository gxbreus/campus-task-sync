import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { loadWebServerConfig } from "@/lib/server/config";
import { createOpaqueToken } from "@/lib/server/crypto";
import { createNotionAuthorizationUrl } from "@/lib/server/notion-oauth";

export const runtime = "nodejs";

const OAUTH_STATE_COOKIE = "cts_notion_oauth_state";

export async function GET(): Promise<Response> {
  try {
    const config = loadWebServerConfig();
    const state = createOpaqueToken();
    const cookieStore = await cookies();
    cookieStore.set(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      maxAge: 10 * 60,
      path: "/",
      sameSite: "lax",
      secure: config.appUrl.startsWith("https://"),
    });
    return NextResponse.redirect(createNotionAuthorizationUrl(config, state), 307);
  } catch {
    return Response.json(
      { message: "A conexão com o Notion ainda não foi configurada pelo administrador." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
