import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { WebServerConfig } from "./config";
import { hashOpaqueToken } from "./crypto";

export type NotionInstallation = {
  notionAccessTokenEncrypted: string;
  notionBotId: string;
  notionRefreshTokenEncrypted: string;
  notionWorkspaceId: string;
  notionWorkspaceName?: string;
  sessionHash: string;
};

export type InstallationRecord = {
  calendarUrlEncrypted?: string;
  moodleTokenEncrypted?: string;
  notionAccessTokenEncrypted: string;
  notionDataSourceId?: string;
  notionWorkspaceId: string;
};

function client(config: WebServerConfig) {
  return createClient(config.supabaseUrl, config.supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function saveNotionInstallation(
  config: WebServerConfig,
  installation: NotionInstallation,
): Promise<void> {
  const supabase = client(config);
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

export async function findInstallation(
  config: WebServerConfig,
  installationToken: string,
): Promise<InstallationRecord | undefined> {
  const { data, error } = await client(config)
    .from("web_installations")
    .select(
      "calendar_url_encrypted,moodle_token_encrypted,notion_access_token_encrypted,notion_data_source_id,notion_workspace_id",
    )
    .eq("session_hash", hashOpaqueToken(installationToken))
    .maybeSingle();
  if (error) throw new Error("Não foi possível consultar a instalação.");
  if (!data) return undefined;
  return {
    notionAccessTokenEncrypted: data.notion_access_token_encrypted,
    notionWorkspaceId: data.notion_workspace_id,
    ...(data.calendar_url_encrypted
      ? { calendarUrlEncrypted: data.calendar_url_encrypted }
      : {}),
    ...(data.moodle_token_encrypted
      ? { moodleTokenEncrypted: data.moodle_token_encrypted }
      : {}),
    ...(data.notion_data_source_id
      ? { notionDataSourceId: data.notion_data_source_id }
      : {}),
  };
}

export async function updateInstallation(
  config: WebServerConfig,
  installationToken: string,
  values: {
    calendarUrlEncrypted?: string;
    moodleTokenEncrypted?: string;
    notionDataSourceId?: string;
  },
): Promise<void> {
  const payload = {
    ...(values.calendarUrlEncrypted
      ? { calendar_url_encrypted: values.calendarUrlEncrypted }
      : {}),
    ...(values.moodleTokenEncrypted
      ? { moodle_token_encrypted: values.moodleTokenEncrypted }
      : {}),
    ...(values.notionDataSourceId
      ? { notion_data_source_id: values.notionDataSourceId }
      : {}),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await client(config)
    .from("web_installations")
    .update(payload)
    .eq("session_hash", hashOpaqueToken(installationToken))
    .select("id")
    .maybeSingle();
  if (error || !data) throw new Error("Não foi possível atualizar a instalação.");
}
