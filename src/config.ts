type BaseConfig = {
  calendarUrl: string;
  moodleToken?: string;
};

export type AppConfig = BaseConfig & {
  notionToken: string;
  notionDataSourceId: string;
  notionAssigneeUserId?: string;
  openAiApiKey?: string;
  openAiModel: string;
  openAiSuggestionsEnabled: boolean;
};

export type NotionSetupConfig = BaseConfig & {
  notionToken: string;
  notionParentPageUrl: string;
  notionDataSourceId?: string;
};

function required(name: string, env: NodeJS.ProcessEnv): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Variavel obrigatoria ausente: ${name}`);
  return value;
}

export function loadCalendarConfig(env: NodeJS.ProcessEnv = process.env): BaseConfig {
  return {
    calendarUrl: required("CALENDAR_ICS_URL", env),
    moodleToken: env.MOODLE_TOKEN?.trim() || undefined,
  };
}

export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    ...loadCalendarConfig(env),
    notionToken: required("NOTION_TOKEN", env),
    notionDataSourceId: required("NOTION_DATA_SOURCE_ID", env),
    notionAssigneeUserId: env.NOTION_ASSIGNEE_USER_ID?.trim() || undefined,
    openAiApiKey: env.OPENAI_API_KEY?.trim() || undefined,
    openAiModel: env.OPENAI_MODEL?.trim() || "gpt-5.6-terra",
    openAiSuggestionsEnabled: /^(1|true|yes)$/i.test(
      env.ENABLE_AI_SUGGESTIONS?.trim() ?? "",
    ),
  };
}

export function loadNotionSetupConfig(
  env: NodeJS.ProcessEnv = process.env,
): NotionSetupConfig {
  return {
    ...loadCalendarConfig(env),
    notionToken: required("NOTION_TOKEN", env),
    notionParentPageUrl: required("NOTION_PARENT_PAGE_URL", env),
    notionDataSourceId: env.NOTION_DATA_SOURCE_ID?.trim() || undefined,
  };
}
