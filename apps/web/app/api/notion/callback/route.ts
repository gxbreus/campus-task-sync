import { timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { loadWebServerConfig } from "@/lib/server/config";
import { createOpaqueToken, encryptSecret, hashOpaqueToken } from "@/lib/server/crypto";
import { saveNotionInstallation } from "@/lib/server/installations";
import { exchangeNotionCode } from "@/lib/server/notion-oauth";
import { INSTALLATION_COOKIE } from "@/lib/server/session";

export const runtime = "nodejs";

const OAUTH_STATE_COOKIE = "cts_notion_oauth_state";

function sameState(received: string | null, expected: string | undefined): boolean {
  if (!received || !expected) return false;
  const left = Buffer.from(received, "utf8");
  const right = Buffer.from(expected, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

function homeUrl(appUrl: string, status: "connected" | "error"): URL {
  const url = new URL(appUrl);
  url.searchParams.set("notion", status);
  return url;
}

export async function GET(request: NextRequest): Promise<Response> {
  let appUrl = request.nextUrl.origin;
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  cookieStore.delete(OAUTH_STATE_COOKIE);

  try {
    const config = loadWebServerConfig();
    appUrl = config.appUrl;
    const state = request.nextUrl.searchParams.get("state");
    const code = request.nextUrl.searchParams.get("code");
    const denied = request.nextUrl.searchParams.has("error");
    if (denied || !code || code.length > 512 || !sameState(state, expectedState)) {
      return NextResponse.redirect(homeUrl(appUrl, "error"), 303);
    }

    const notion = await exchangeNotionCode(config, code);
    const installationToken = createOpaqueToken();
    await saveNotionInstallation(config, {
      sessionHash: hashOpaqueToken(installationToken),
      notionWorkspaceId: notion.workspace_id,
      notionWorkspaceName: notion.workspace_name,
      notionBotId: notion.bot_id,
      notionAccessTokenEncrypted: encryptSecret(notion.access_token, config.encryptionKey),
      notionRefreshTokenEncrypted: encryptSecret(notion.refresh_token, config.encryptionKey),
    });
    cookieStore.set(INSTALLATION_COOKIE, installationToken, {
      httpOnly: true,
      maxAge: 180 * 24 * 60 * 60,
      path: "/",
      sameSite: "lax",
      secure: config.appUrl.startsWith("https://"),
    });
    return NextResponse.redirect(homeUrl(appUrl, "connected"), 303);
  } catch {
    return NextResponse.redirect(homeUrl(appUrl, "error"), 303);
  }
}
