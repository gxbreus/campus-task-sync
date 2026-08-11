import "dotenv/config";

import { fetchCalendar } from "./calendar/fetch-calendar.js";
import { loadNotionSetupConfig } from "./config.js";
import { setupNotion } from "./notion/setup-notion.js";

async function main(): Promise<void> {
  const config = loadNotionSetupConfig();
  const tasks = await fetchCalendar(config.calendarUrl);
  const result = await setupNotion({
    token: config.notionToken,
    parentPageUrl: config.notionParentPageUrl,
    existingDataSourceId: config.notionDataSourceId,
    courses: tasks.flatMap((task) => (task.course ? [task.course] : [])),
  });

  console.log(
    JSON.stringify({
      created: result.created,
      dataSourceConfigured: true,
      viewsCreated: result.viewsCreated,
      notificationsConfigured: Boolean(result.assigneeUserId),
    }),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Erro desconhecido.";
  console.error(message);
  process.exitCode = 1;
});
