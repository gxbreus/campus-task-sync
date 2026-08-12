import "dotenv/config";

import { loadNotionSetupConfig } from "./config.js";
import { MoodleClient } from "./moodle/client.js";
import { setupAttendancePanel } from "./notion/setup-attendance.js";
import { parseNotionPageId } from "./notion/setup-notion.js";

async function main(): Promise<void> {
  const config = loadNotionSetupConfig();
  if (!config.moodleToken) {
    throw new Error("MOODLE_TOKEN e obrigatorio para identificar as disciplinas do semestre.");
  }
  const moodle = new MoodleClient({
    calendarUrl: config.calendarUrl,
    token: config.moodleToken,
  });
  const courses = await moodle.getCurrentSemesterCourses();
  if (courses.length === 0) throw new Error("Nenhuma disciplina do semestre foi encontrada.");

  const result = await setupAttendancePanel({
    token: config.notionToken,
    parentPageId: parseNotionPageId(config.notionParentPageUrl),
    courses,
  });
  console.log(JSON.stringify({ ...result, courses: courses.length }));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Erro desconhecido.";
  console.error(message);
  process.exitCode = 1;
});
