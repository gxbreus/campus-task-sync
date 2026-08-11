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

  return parseCalendar(await response.text());
}
