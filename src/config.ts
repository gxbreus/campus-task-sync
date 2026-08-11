type BaseConfig = {
  calendarUrl: string;
};

export type AppConfig = BaseConfig & {
  notionToken: string;
  notionDataSourceId: string;
};

function required(name: string, env: NodeJS.ProcessEnv): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Variavel obrigatoria ausente: ${name}`);
  return value;
}

export function loadCalendarConfig(env: NodeJS.ProcessEnv = process.env): BaseConfig {
  return { calendarUrl: required("CALENDAR_ICS_URL", env) };
}

export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    ...loadCalendarConfig(env),
    notionToken: required("NOTION_TOKEN", env),
    notionDataSourceId: required("NOTION_DATA_SOURCE_ID", env),
  };
}
