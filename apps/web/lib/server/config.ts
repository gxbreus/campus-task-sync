import "server-only";

export type WebServerConfig = {
  appUrl: string;
  encryptionKey: string;
  notionClientId: string;
  notionClientSecret: string;
  syncCronSecret?: string;
  supabaseSecretKey: string;
  supabaseUrl: string;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Configuração obrigatória ausente: ${name}`);
  return value;
}

export function isNotionOAuthConfigured(): boolean {
  return [
    "NEXT_PUBLIC_APP_URL",
    "NOTION_OAUTH_CLIENT_ID",
    "NOTION_OAUTH_CLIENT_SECRET",
    "SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "APP_ENCRYPTION_KEY",
  ].every((name) => Boolean(process.env[name]?.trim()));
}

export function loadWebServerConfig(): WebServerConfig {
  const appUrl = new URL(required("NEXT_PUBLIC_APP_URL"));
  if (appUrl.protocol !== "https:" && appUrl.hostname !== "localhost") {
    throw new Error("NEXT_PUBLIC_APP_URL precisa usar HTTPS fora do ambiente local.");
  }

  return {
    appUrl: appUrl.origin,
    encryptionKey: required("APP_ENCRYPTION_KEY"),
    notionClientId: required("NOTION_OAUTH_CLIENT_ID"),
    notionClientSecret: required("NOTION_OAUTH_CLIENT_SECRET"),
    ...(process.env.SYNC_CRON_SECRET?.trim()
      ? { syncCronSecret: process.env.SYNC_CRON_SECRET.trim() }
      : {}),
    supabaseSecretKey: required("SUPABASE_SECRET_KEY"),
    supabaseUrl: required("SUPABASE_URL"),
  };
}
