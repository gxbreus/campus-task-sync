import "dotenv/config";

import { coursesWithCredits } from "./attendance/course-credits.js";
import { loadNotionSetupConfig } from "./config.js";
import { GradeUflaClient } from "./grade-ufla/client.js";
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
  const moodleCourses = await moodle.getCurrentSemesterCourses();
  let gradeCredits = new Map<string, number>();
  try {
    gradeCredits = await new GradeUflaClient().latestCredits(moodleCourses);
  } catch (error) {
    console.warn(error instanceof Error ? error.message : "Grade UFLA indisponivel.");
  }
  const courses = coursesWithCredits(moodleCourses, process.env.COURSE_CREDITS, gradeCredits);
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
