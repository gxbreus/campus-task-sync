import { parseCalendar } from "./parse-ics.js";
import type { CampusTask } from "../domain/task.js";

export async function fetchCalendar(
  calendarUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<CampusTask[]> {
  const response = await fetcher(calendarUrl, {
    headers: { accept: "text/calendar, text/plain;q=0.9" },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Falha ao consultar o calendario do Campus (HTTP ${response.status}).`);
  }

  const parsedUrl = new URL(calendarUrl);
  const calendarPathIndex = parsedUrl.pathname.indexOf("/calendar/");
  const campusPath = calendarPathIndex >= 0 ? parsedUrl.pathname.slice(0, calendarPathIndex) : "";
  return parseCalendar(await response.text(), {
    campusBaseUrl: `${parsedUrl.origin}${campusPath}`,
  });
}
