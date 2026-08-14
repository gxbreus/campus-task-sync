import "server-only";

import { coursesWithCredits } from "@campus/attendance/course-credits";
import { fetchCalendar } from "@campus/calendar/fetch-calendar";
import type { CampusTask } from "@campus/domain/task";
import { GradeUflaClient } from "@campus/grade-ufla/client";
import { MoodleClient } from "@campus/moodle/client";
import { enrichTasksWithMoodle } from "@campus/moodle/enrich-tasks";
import { NotionDestination } from "@campus/notion/notion-destination";
import { setupAttendancePanel } from "@campus/notion/setup-attendance";
import { setupNotion } from "@campus/notion/setup-notion";
import { syncTasks } from "@campus/sync/sync-tasks";

import type { WebServerConfig } from "./config";
import { decryptSecret } from "./crypto";
import {
  findInstallation,
  updateInstallation,
  type InstallationRecord,
} from "./installations";

const NOTION_VERSION = "2026-03-11";

type RuntimeInstallation = {
  calendarUrl?: string;
  dataSourceId?: string;
  moodleToken?: string;
  notionToken: string;
  record: InstallationRecord;
};

async function runtimeInstallation(
  config: WebServerConfig,
  installationToken: string,
): Promise<RuntimeInstallation> {
  const record = await findInstallation(config, installationToken);
  if (!record) throw new Error("Conecte novamente o Notion para continuar.");
  return {
    record,
    notionToken: decryptSecret(record.notionAccessTokenEncrypted, config.encryptionKey),
    ...(record.calendarUrlEncrypted
      ? { calendarUrl: decryptSecret(record.calendarUrlEncrypted, config.encryptionKey) }
      : {}),
    ...(record.moodleTokenEncrypted
      ? { moodleToken: decryptSecret(record.moodleTokenEncrypted, config.encryptionKey) }
      : {}),
    ...(record.notionDataSourceId ? { dataSourceId: record.notionDataSourceId } : {}),
  };
}

async function notionParentPageId(notionToken: string): Promise<string> {
  const response = await fetch("https://api.notion.com/v1/search", {
    method: "POST",
    headers: {
      authorization: `Bearer ${notionToken}`,
      "content-type": "application/json",
      "notion-version": NOTION_VERSION,
    },
    body: JSON.stringify({
      filter: { property: "object", value: "page" },
      page_size: 100,
      sort: { direction: "descending", timestamp: "last_edited_time" },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await response.json().catch(() => null)) as
    | { results?: Array<{ id?: string; parent?: { type?: string } }> }
    | null;
  if (!response.ok) throw new Error("O Notion não permitiu consultar a página autorizada.");
  const pages = body?.results?.filter((page) => typeof page.id === "string") ?? [];
  const page = pages.find((item) => item.parent?.type === "workspace") ?? pages[0];
  if (!page?.id) {
    throw new Error("Nenhuma página foi compartilhada. Reconecte o Notion e escolha uma página vazia.");
  }
  return page.id;
}

async function tasks(runtime: RuntimeInstallation): Promise<CampusTask[]> {
  if (!runtime.calendarUrl) throw new Error("Valide o calendário antes de continuar.");
  const calendarTasks = await fetchCalendar(runtime.calendarUrl);
  if (!runtime.moodleToken) return calendarTasks;
  const moodle = new MoodleClient({
    calendarUrl: runtime.calendarUrl,
    token: runtime.moodleToken,
  });
  return enrichTasksWithMoodle(calendarTasks, moodle);
}

export async function setupTaskPanel(config: WebServerConfig, token: string) {
  const runtime = await runtimeInstallation(config, token);
  const loadedTasks = await tasks(runtime);
  const parentPageId = await notionParentPageId(runtime.notionToken);
  const result = await setupNotion({
    token: runtime.notionToken,
    parentPageUrl: `https://www.notion.so/${parentPageId.replaceAll("-", "")}`,
    courses: [
      ...new Set(
        loadedTasks
          .map((task) => task.course)
          .filter((course): course is string => Boolean(course)),
      ),
    ],
    existingDataSourceId: runtime.dataSourceId,
    saveDataSourceId: async (dataSourceId) => {
      await updateInstallation(config, token, { notionDataSourceId: dataSourceId });
    },
    saveAssigneeUserId: async () => {},
  });
  return { ...result, tasksFound: loadedTasks.length };
}

export async function setupAttendance(config: WebServerConfig, token: string) {
  const runtime = await runtimeInstallation(config, token);
  if (!runtime.calendarUrl || !runtime.moodleToken) {
    throw new Error("Calendário e token do Campus são obrigatórios para criar o controle de faltas.");
  }
  const moodle = new MoodleClient({
    calendarUrl: runtime.calendarUrl,
    token: runtime.moodleToken,
  });
  const moodleCourses = await moodle.getCurrentSemesterCourses();
  let credits = new Map<string, number>();
  try {
    credits = await new GradeUflaClient().latestCredits(moodleCourses);
  } catch {
    throw new Error("Não foi possível consultar os créditos das disciplinas agora.");
  }
  const courses = coursesWithCredits(moodleCourses, undefined, credits);
  if (!courses.length) throw new Error("Nenhuma disciplina do semestre foi encontrada.");
  const parentPageId = await notionParentPageId(runtime.notionToken);
  const result = await setupAttendancePanel({
    token: runtime.notionToken,
    parentPageId,
    courses,
  });
  return { ...result, courses: courses.length };
}

export async function synchronize(config: WebServerConfig, token: string) {
  const runtime = await runtimeInstallation(config, token);
  if (!runtime.dataSourceId) throw new Error("Crie primeiro o painel de tarefas.");
  const loadedTasks = await tasks(runtime);
  const destination = new NotionDestination({
    token: runtime.notionToken,
    dataSourceId: runtime.dataSourceId,
  });
  const result = await syncTasks(loadedTasks, destination);
  return { calendarTasks: loadedTasks.length, ...result };
}
