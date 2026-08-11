import "dotenv/config";

import { fetchCalendar } from "./calendar/fetch-calendar.js";
import { loadAppConfig, loadCalendarConfig } from "./config.js";
import { NotionDestination } from "./notion/notion-destination.js";
import { createOpenAiAnswerGenerator } from "./ai/generate-answer.js";
import { MoodleClient } from "./moodle/client.js";
import { enrichTasksWithMoodle } from "./moodle/enrich-tasks.js";
import { syncTasks } from "./sync/sync-tasks.js";

const dryRun = process.argv.includes("--dry-run");

async function loadTasks(calendarUrl: string, moodleToken?: string) {
  const calendarTasks = await fetchCalendar(calendarUrl);
  if (!moodleToken) return { tasks: calendarTasks, enriched: 0 };

  try {
    const client = new MoodleClient({ calendarUrl, token: moodleToken });
    const tasks = await enrichTasksWithMoodle(calendarTasks, client);
    const enriched = tasks.filter((task, index) => task !== calendarTasks[index]).length;
    return { tasks, enriched };
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    console.error(`Detalhes do Moodle indisponiveis; usando somente o calendario: ${message}`);
    return { tasks: calendarTasks, enriched: 0 };
  }
}

async function main(): Promise<void> {
  if (dryRun) {
    const { calendarUrl, moodleToken } = loadCalendarConfig();
    const { tasks, enriched } = await loadTasks(calendarUrl, moodleToken);
    console.log(JSON.stringify({ count: tasks.length, enriched, tasks }, null, 2));
    return;
  }

  const config = loadAppConfig();
  const { tasks, enriched } = await loadTasks(config.calendarUrl, config.moodleToken);
  const destination = new NotionDestination({
    token: config.notionToken,
    dataSourceId: config.notionDataSourceId,
    assigneeUserId: config.notionAssigneeUserId,
    answerGenerator: config.openAiSuggestionsEnabled && config.openAiApiKey
      ? createOpenAiAnswerGenerator({
          apiKey: config.openAiApiKey,
          model: config.openAiModel,
        })
      : undefined,
  });
  const result = await syncTasks(tasks, destination);

  console.log(JSON.stringify({ calendarTasks: tasks.length, moodleEnriched: enriched, ...result }));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Erro desconhecido.";
  console.error(message);
  process.exitCode = 1;
});
