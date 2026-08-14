import "server-only";

import type { WebServerConfig } from "./config";

const NOTION_OAUTH_AUTHORIZE_URL = "https://api.notion.com/v1/oauth/authorize";
const NOTION_OAUTH_TOKEN_URL = "https://api.notion.com/v1/oauth/token";

export type NotionTokenResponse = {
  access_token: string;
  bot_id: string;
  refresh_token: string;
  workspace_id: string;
  workspace_name?: string;
};

export function notionCallbackUrl(config: WebServerConfig): string {
  return `${config.appUrl}/api/notion/callback`;
}

export function createNotionAuthorizationUrl(config: WebServerConfig, state: string): string {
  const url = new URL(NOTION_OAUTH_AUTHORIZE_URL);
  url.searchParams.set("client_id", config.notionClientId);
  url.searchParams.set("redirect_uri", notionCallbackUrl(config));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("owner", "user");
  url.searchParams.set("state", state);
  return url.toString();
}

function isTokenResponse(value: unknown): value is NotionTokenResponse {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return ["access_token", "refresh_token", "bot_id", "workspace_id"].every(
    (key) => typeof item[key] === "string" && item[key].length > 0,
  );
}

export async function exchangeNotionCode(
  config: WebServerConfig,
  code: string,
): Promise<NotionTokenResponse> {
  const authorization = Buffer.from(
    `${config.notionClientId}:${config.notionClientSecret}`,
    "utf8",
  ).toString("base64");
  const response = await fetch(NOTION_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Basic ${authorization}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: notionCallbackUrl(config),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok || !isTokenResponse(result)) {
    throw new Error("O Notion não concluiu a autorização.");
  }
  return result;
}
