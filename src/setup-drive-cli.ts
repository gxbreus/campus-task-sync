import "dotenv/config";

import { loadCalendarConfig } from "./config.js";
import { authorizeDrive } from "./drive/auth.js";
import { GoogleDriveDestination } from "./drive/google-drive.js";
import { MoodleClient } from "./moodle/client.js";

async function main(): Promise<void> {
  const config = loadCalendarConfig();
  if (!config.moodleToken) {
    throw new Error("MOODLE_TOKEN é obrigatório para identificar o semestre. Execute npm run setup:moodle.");
  }
  const moodle = new MoodleClient({ calendarUrl: config.calendarUrl, token: config.moodleToken });
  const courses = await moodle.getCurrentSemesterCourses();
  const period = courses.map((course) => course.period).sort().at(-1);
  if (!period) throw new Error("O Moodle não informou o semestre atual.");
  const auth = await authorizeDrive();
  const destination = new GoogleDriveDestination(auth);
  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim() ||
    await destination.getOrCreateFolder(`Campus Virtual - ${period.replace("/", ".")}`);
  console.log(JSON.stringify({ authorized: true, period, rootFolderId }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Erro desconhecido.");
  process.exitCode = 1;
});
