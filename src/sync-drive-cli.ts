import "dotenv/config";

import { loadCalendarConfig } from "./config.js";
import { authorizeDrive } from "./drive/auth.js";
import { GoogleDriveDestination } from "./drive/google-drive.js";
import { syncMaterialsToDrive } from "./drive/sync-materials.js";
import { MoodleClient } from "./moodle/client.js";
import { IMPORTANT_DATES_2026_2 } from "./plans/semester-2026-2.js";

async function main(): Promise<void> {
  const config = loadCalendarConfig();
  if (!config.moodleToken) throw new Error("MOODLE_TOKEN é obrigatório para baixar os materiais.");
  const moodle = new MoodleClient({
    calendarUrl: config.calendarUrl,
    token: config.moodleToken,
    maximumAttachmentBytes: 200 * 1024 * 1024,
  });
  const courses = await moodle.getCurrentSemesterCourses();
  const auth = await authorizeDrive({ interactive: false });
  const drive = new GoogleDriveDestination(auth);
  const result = await syncMaterialsToDrive({
    moodle,
    drive,
    courses,
    importantDates: IMPORTANT_DATES_2026_2,
    rootFolderId: process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim() || undefined,
  });
  console.log(JSON.stringify(result));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Erro desconhecido.");
  process.exitCode = 1;
});
