import "dotenv/config";

import { fetchCalendar } from "./calendar/fetch-calendar.js";
import { loadAppConfig, loadCalendarConfig } from "./config.js";
import { NotionDestination } from "./notion/notion-destination.js";
import { syncTasks } from "./sync/sync-tasks.js";

const dryRun = process.argv.includes("--dry-run");

async function main(): Promise<void> {
  if (dryRun) {
    const { calendarUrl } = loadCalendarConfig();
    const tasks = await fetchCalendar(calendarUrl);
    console.log(JSON.stringify({ count: tasks.length, tasks }, null, 2));
    return;
  }

  const config = loadAppConfig();
  const tasks = await fetchCalendar(config.calendarUrl);
  const destination = new NotionDestination({
    token: config.notionToken,
    dataSourceId: config.notionDataSourceId,
    assigneeUserId: config.notionAssigneeUserId,
  });
  const result = await syncTasks(tasks, destination);

  console.log(JSON.stringify({ calendarTasks: tasks.length, ...result }));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Erro desconhecido.";
  console.error(message);
  process.exitCode = 1;
});
