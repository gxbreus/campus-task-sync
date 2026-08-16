import "server-only";

import { coursesWithCredits } from "@campus/attendance/course-credits";
import { fetchCalendar } from "@campus/calendar/fetch-calendar";
import type { CampusTask } from "@campus/domain/task";
import { GradeUflaClient } from "@campus/grade-ufla/client";
import { MoodleClient } from "@campus/moodle/client";
import { enrichTasksWithMoodle } from "@campus/moodle/enrich-tasks";
import { NotionDestination } from "@campus/notion/notion-destination";
import { setupAttendancePanel } from "@campus/notion/setup-attendance";
import { setupImportantDatesPanel } from "@campus/notion/setup-important-dates";
import { setupNotion } from "@campus/notion/setup-notion";
import { discoverTeachingPlans } from "@campus/plans/discover-teaching-plans";
import { parseTeachingPlanText } from "@campus/plans/parse-teaching-plan";
import { extractPdfText } from "@campus/plans/pdf-text";
import { syncTasks } from "@campus/sync/sync-tasks";

import type { WebServerConfig } from "./config";
import { decryptSecret } from "./crypto";
import {
  findInstallation,
  listReadyInstallations,
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
  return runtimeFromRecord(config, record);
}

function runtimeFromRecord(
  config: WebServerConfig,
  record: InstallationRecord,
): RuntimeInstallation {
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
  const options = {
    token: runtime.notionToken,
    parentPageUrl: `https://www.notion.so/${parentPageId.replaceAll("-", "")}`,
    courses: [
      ...new Set(
        loadedTasks
          .map((task) => task.course)
          .filter((course): course is string => Boolean(course)),
      ),
    ],
    saveDataSourceId: async (dataSourceId: string) => {
      await updateInstallation(config, token, { notionDataSourceId: dataSourceId });
    },
    saveAssigneeUserId: async () => {},
  };
  let result;
  try {
    result = await setupNotion({ ...options, existingDataSourceId: runtime.dataSourceId });
  } catch (error) {
    const missingPreviousPanel = runtime.dataSourceId && error instanceof Error &&
      /HTTP 404|object_not_found|could not find/i.test(error.message);
    if (!missingPreviousPanel) throw error;
    await updateInstallation(config, token, { notionDataSourceId: null });
    result = await setupNotion(options);
  }
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

export async function setupImportantDates(config: WebServerConfig, token: string) {
  const runtime = await runtimeInstallation(config, token);
  return setupImportantDatesForRuntime(runtime);
}

async function setupImportantDatesForRuntime(runtime: RuntimeInstallation) {
  if (!runtime.calendarUrl || !runtime.moodleToken) {
    throw new Error("Calendário e token do Campus são obrigatórios para localizar os planos de ensino.");
  }
  const moodle = new MoodleClient({
    calendarUrl: runtime.calendarUrl,
    token: runtime.moodleToken,
  });
  const courses = await moodle.getCurrentSemesterCourses();
  const plans = await discoverTeachingPlans(moodle, courses);
  const parentPageId = await notionParentPageId(runtime.notionToken);
  const result = await setupImportantDatesPanel({
    token: runtime.notionToken,
    parentPageId,
    dates: plans.dates,
  });
  return {
    ...result,
    dates: plans.dates.length,
    plansFound: plans.plansFound,
    plansParsed: plans.plansParsed,
  };
}

export async function structureNotion(config: WebServerConfig, token: string) {
  const tasksPanel = await setupTaskPanel(config, token);
  const [attendanceResult, datesResult] = await Promise.allSettled([
    setupAttendance(config, token),
    setupImportantDates(config, token),
  ]);
  const warnings: string[] = [];
  if (attendanceResult.status === "rejected") {
    warnings.push("O painel de tarefas foi criado, mas o controle de faltas não pôde ser atualizado agora.");
  }
  if (datesResult.status === "rejected") {
    warnings.push("O painel de tarefas foi criado, mas os planos do Campus não puderam ser consultados agora.");
  }
  return {
    tasksPanel,
    ...(attendanceResult.status === "fulfilled" ? { attendance: attendanceResult.value } : {}),
    ...(datesResult.status === "fulfilled" ? { importantDates: datesResult.value } : {}),
    warnings,
  };
}

function currentSemester(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}/${now.getUTCMonth() >= 6 ? 2 : 1}`;
}

export async function importTeachingPlans(
  config: WebServerConfig,
  token: string,
  files: Array<{ bytes: Uint8Array; name: string }>,
) {
  const runtime = await runtimeInstallation(config, token);
  const dates = [];
  const rejected: string[] = [];
  for (const file of files) {
    try {
      const text = await extractPdfText(file.bytes);
      const parsed = parseTeachingPlanText(text, {
        code: "PLANO",
        name: file.name.replace(/\.pdf$/i, ""),
        period: currentSemester(),
      });
      if (!parsed.length) {
        rejected.push(file.name);
        continue;
      }
      dates.push(...parsed.map((date) => ({
        ...date,
        notes: "Data extraída de um plano de ensino enviado manualmente no Campus Task Sync.",
      })));
    } catch {
      rejected.push(file.name);
    }
  }
  if (!dates.length) {
    throw new Error("Nenhuma avaliação foi reconhecida nos planos enviados.");
  }
  const parentPageId = await notionParentPageId(runtime.notionToken);
  const uniqueDates = [...new Map(dates.map((date) => [date.id, date])).values()];
  const result = await setupImportantDatesPanel({
    token: runtime.notionToken,
    parentPageId,
    dates: uniqueDates,
  });
  return { ...result, dates: uniqueDates.length, files: files.length, rejected };
}

export async function synchronize(config: WebServerConfig, token: string) {
  const runtime = await runtimeInstallation(config, token);
  return synchronizeRuntime(runtime);
}

async function synchronizeRuntime(runtime: RuntimeInstallation) {
  if (!runtime.dataSourceId) throw new Error("Crie primeiro o painel de tarefas.");
  const loadedTasks = await tasks(runtime);
  const destination = new NotionDestination({
    token: runtime.notionToken,
    dataSourceId: runtime.dataSourceId,
  });
  const result = await syncTasks(loadedTasks, destination);
  try {
    const importantDates = await setupImportantDatesForRuntime(runtime);
    return { calendarTasks: loadedTasks.length, importantDates, warnings: [], ...result };
  } catch {
    return {
      calendarTasks: loadedTasks.length,
      warnings: ["As tarefas foram sincronizadas, mas os planos do Campus não puderam ser consultados agora."],
      ...result,
    };
  }
}

export async function synchronizeReadyInstallations(config: WebServerConfig) {
  const records = await listReadyInstallations(config);
  let succeeded = 0;
  let failed = 0;
  for (const record of records) {
    try {
      await synchronizeRuntime(runtimeFromRecord(config, record));
      succeeded += 1;
    } catch {
      failed += 1;
    }
  }
  return { processed: records.length, succeeded, failed };
}
