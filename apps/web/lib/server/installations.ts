import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { WebServerConfig } from "./config";

export type NotionInstallation = {
  notionAccessTokenEncrypted: string;
  notionBotId: string;
  notionRefreshTokenEncrypted: string;
  notionWorkspaceId: string;
  notionWorkspaceName?: string;
  sessionHash: string;
};

export async function saveNotionInstallation(
  config: WebServerConfig,
  installation: NotionInstallation,
): Promise<void> {
  const supabase = createClient(config.supabaseUrl, config.supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await supabase.from("web_installations").upsert(
    {
      session_hash: installation.sessionHash,
      notion_workspace_id: installation.notionWorkspaceId,
      notion_workspace_name: installation.notionWorkspaceName ?? null,
      notion_bot_id: installation.notionBotId,
      notion_access_token_encrypted: installation.notionAccessTokenEncrypted,
      notion_refresh_token_encrypted: installation.notionRefreshTokenEncrypted,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "notion_workspace_id" },
  );

  if (error) throw new Error("Não foi possível salvar a instalação no banco.");
}
