import "dotenv/config";

import { loadNotionSetupConfig } from "./config.js";
import { MoodleClient } from "./moodle/client.js";
import { markPlannedAbsences } from "./notion/mark-planned-absences.js";
import { setupAttendancePanel } from "./notion/setup-attendance.js";
import { setupImportantDatesPanel } from "./notion/setup-important-dates.js";
import { parseNotionPageId } from "./notion/setup-notion.js";
import { IMPORTANT_DATES_2026_2, PLANNED_ABSENCES_2026_2, TRAVEL_PERIOD } from "./plans/semester-2026-2.js";

async function main(): Promise<void> {
  const config = loadNotionSetupConfig();
  if (!config.moodleToken) throw new Error("MOODLE_TOKEN é obrigatório para localizar o controle de faltas.");
  const parentPageId = parseNotionPageId(config.notionParentPageUrl);
  const moodle = new MoodleClient({ calendarUrl: config.calendarUrl, token: config.moodleToken });
  const courses = await moodle.getCurrentSemesterCourses();
  const attendance = await setupAttendancePanel({
    token: config.notionToken,
    parentPageId,
    courses,
  });
  const result = await setupImportantDatesPanel({
    token: config.notionToken,
    parentPageId,
    dates: IMPORTANT_DATES_2026_2,
    travel: TRAVEL_PERIOD,
  });
  const attendanceRowsUpdated = await markPlannedAbsences({
    token: config.notionToken,
    dataSourceId: attendance.dataSourceId,
    absences: PLANNED_ABSENCES_2026_2,
  });
  console.log(JSON.stringify({ ...result, attendanceDataSourceId: attendance.dataSourceId, attendanceRowsUpdated }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Erro desconhecido.");
  process.exitCode = 1;
});
