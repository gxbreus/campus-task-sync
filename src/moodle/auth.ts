import { chmod, readFile, writeFile } from "node:fs/promises";

type MoodleAuthOptions = {
  calendarUrl: string;
  username: string;
  password: string;
  fetcher?: typeof fetch;
};

type JsonObject = Record<string, unknown>;

const CAMPUS_HOSTNAME = "campusvirtual.ufla.br";

function trustedCampusUrl(value: string): URL {
  const parsedUrl = new URL(value);
  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.hostname !== CAMPUS_HOSTNAME ||
    parsedUrl.port ||
    parsedUrl.username ||
    parsedUrl.password
  ) {
    throw new Error(
      `URL do Campus nao confiavel. Use somente https://${CAMPUS_HOSTNAME}/.`,
    );
  }
  return parsedUrl;
}

export function campusBaseUrlFromCalendarUrl(calendarUrl: string): string {
  const parsedUrl = trustedCampusUrl(calendarUrl);
  const calendarPathIndex = parsedUrl.pathname.indexOf("/calendar/");
  if (calendarPathIndex < 0) {
    throw new Error("URL do Campus invalida: o caminho do calendario nao foi encontrado.");
  }
  const campusPath = parsedUrl.pathname.slice(0, calendarPathIndex);
  return `${parsedUrl.origin}${campusPath}`;
}

export async function requestMoodleToken(options: MoodleAuthOptions): Promise<string> {
  const fetcher = options.fetcher ?? fetch;
  const baseUrl = campusBaseUrlFromCalendarUrl(options.calendarUrl);
  const response = await fetcher(`${baseUrl}/login/token.php`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      username: options.username,
      password: options.password,
      service: "moodle_mobile_app",
    }),
  });
  const data = (await response.json()) as JsonObject;
  if (!response.ok || typeof data.token !== "string") {
    const message = typeof data.error === "string" ? data.error : `HTTP ${response.status}`;
    throw new Error(`O Campus nao emitiu o token: ${message}`);
  }
  return data.token;
}

export async function validateMoodleToken(
  calendarUrl: string,
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const baseUrl = campusBaseUrlFromCalendarUrl(calendarUrl);
  const body = new URLSearchParams({
    wstoken: token,
    wsfunction: "core_webservice_get_site_info",
    moodlewsrestformat: "json",
  });
  const response = await fetcher(`${baseUrl}/webservice/rest/server.php`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await response.json()) as JsonObject;
  if (!response.ok || data.exception || typeof data.userid !== "number") {
    const message = typeof data.message === "string" ? data.message : `HTTP ${response.status}`;
    throw new Error(`O token foi emitido, mas nao passou na validacao: ${message}`);
  }
}

export async function saveEnvMoodleToken(token: string, envPath = ".env"): Promise<void> {
  const current = await readFile(envPath, "utf8");
  const line = `MOODLE_TOKEN=${token}`;
  const expression = /^MOODLE_TOKEN=.*$/m;
  const next = expression.test(current)
    ? current.replace(expression, line)
    : `${current.trimEnd()}\n${line}\n`;
  await writeFile(envPath, next, { encoding: "utf8", mode: 0o600 });
  await chmod(envPath, 0o600);
}
