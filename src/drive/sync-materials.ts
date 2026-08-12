import type { MoodleActivity, MoodleCourseSummary } from "../moodle/client.js";
import type { ImportantDate } from "../plans/semester-2026-2.js";
import type { GoogleDriveDestination, UploadResult } from "./google-drive.js";

type MaterialSource = {
  getActivities(courseCodes: string[]): Promise<MoodleActivity[]>;
  downloadAttachment: (attachment: MoodleActivity["attachments"][number]) => Promise<Uint8Array>;
};

type MaterialDestination = {
  getOrCreateFolder(name: string, parentId?: string): Promise<string>;
  uploadFile(file: {
    name: string;
    mimeType: string;
    bytes: Uint8Array;
    parentId: string;
    sourceId: string;
    courseCode: string;
  }): Promise<UploadResult>;
};

type Options = {
  moodle: MaterialSource;
  drive: MaterialDestination;
  courses: MoodleCourseSummary[];
  importantDates: ImportantDate[];
  rootFolderId?: string;
  semester?: string;
};

export type MaterialsSyncResult = {
  rootFolderId: string;
  activitiesFound: number;
  filesCreated: number;
  filesUpdated: number;
  filesUnchanged: number;
  filesFailed: number;
};

function guideFor(course: MoodleCourseSummary, dates: ImportantDate[]): string {
  const rows = dates
    .filter((date) => date.courseCode === course.code)
    .sort((left, right) => left.start.localeCompare(right.start))
    .map((date) => [
      `## ${date.title}`,
      `- Data prevista: ${date.start}${date.end ? ` a ${date.end}` : ""}`,
      `- Tipo: ${date.type}`,
      ...(date.weight === undefined ? [] : [`- Peso: ${date.weight}%`]),
      ...(date.content ? [`- Conteúdo: ${date.content}`] : []),
      ...(date.notes ? [`- Observação: ${date.notes}`] : []),
    ].join("\n"))
    .join("\n\n");
  return `# Guia de avaliações — ${course.name}\n\n` +
    "Gerado a partir do plano de ensino. Confirme datas e alterações no Campus Virtual.\n\n" +
    (rows || "Nenhuma avaliação com data disponível no plano de ensino atual.\n");
}

function sectionFolder(activity: MoodleActivity): string {
  return activity.sectionName?.trim() || "Materiais gerais";
}

export async function syncMaterialsToDrive(options: Options): Promise<MaterialsSyncResult> {
  const semester = options.semester ?? options.courses.map((course) => course.period).sort().at(-1) ?? "Atual";
  const rootFolderId = options.rootFolderId ?? await options.drive.getOrCreateFolder(`Campus Virtual - ${semester.replace("/", ".")}`);
  const activities = await options.moodle.getActivities(options.courses.map((course) => course.code));
  let filesCreated = 0;
  let filesUpdated = 0;
  let filesUnchanged = 0;
  let filesFailed = 0;

  for (const course of options.courses) {
    const courseFolderId = await options.drive.getOrCreateFolder(`${course.code} - ${course.name}`, rootFolderId);
    const guide = Buffer.from(guideFor(course, options.importantDates), "utf8");
    const guideResult = await options.drive.uploadFile({
      name: "Guia de avaliações.md",
      mimeType: "text/markdown",
      bytes: guide,
      parentId: courseFolderId,
      sourceId: `guide:${semester}:${course.code}`,
      courseCode: course.code,
    });
    if (guideResult === "created") filesCreated += 1;
    else if (guideResult === "updated") filesUpdated += 1;
    else filesUnchanged += 1;

    for (const activity of activities.filter((item) => item.courseCode === course.code)) {
      if (activity.attachments.length === 0) continue;
      const folderId = await options.drive.getOrCreateFolder(sectionFolder(activity), courseFolderId);
      for (const attachment of activity.attachments) {
        try {
          const bytes = await options.moodle.downloadAttachment(attachment);
          const result = await options.drive.uploadFile({
            name: attachment.name,
            mimeType: attachment.mimeType ?? "application/octet-stream",
            bytes,
            parentId: folderId,
            sourceId: attachment.apiUrl ?? `${activity.moduleId}:${attachment.name}`,
            courseCode: course.code,
          });
          if (result === "created") filesCreated += 1;
          else if (result === "updated") filesUpdated += 1;
          else filesUnchanged += 1;
        } catch (error) {
          filesFailed += 1;
          const message = error instanceof Error ? error.message : "erro desconhecido";
          console.warn(`Não foi possível sincronizar ${course.code}/${attachment.name}: ${message}`);
        }
      }
    }
  }
  return { rootFolderId, activitiesFound: activities.length, filesCreated, filesUpdated, filesUnchanged, filesFailed };
}
