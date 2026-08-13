import type { TaskAttachment } from "../domain/task.js";
import { campusBaseUrlFromCalendarUrl } from "./auth.js";

type JsonObject = Record<string, unknown>;

type MoodleClientOptions = {
  calendarUrl: string;
  token: string;
  fetcher?: typeof fetch;
  maximumAttachmentBytes?: number;
};

export type MoodleActivity = {
  courseCode: string;
  courseName: string;
  moduleId: number;
  name: string;
  sectionName?: string;
  url?: string;
  description?: string;
  opensAt?: string;
  dueAt?: string;
  attachments: TaskAttachment[];
};

type MoodleCourse = {
  id: number;
  shortname: string;
  fullname: string;
};

export type MoodleCourseSummary = {
  code: string;
  name: string;
  period: string;
  curriculumIds: string[];
};

function objectValue(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null ? (value as JsonObject) : undefined;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    }
    if (code.startsWith("#")) return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    return named[code.toLowerCase()] ?? entity;
  });
}

export function htmlToPlainText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const text = decodeHtmlEntities(
    value
      .replace(/\r/g, "")
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\s*li\b[^>]*>/gi, "\n- ")
      .replace(/<\/(?:p|div|h[1-6]|li|ul|ol)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text || undefined;
}

function courseCode(course: MoodleCourse): string | undefined {
  return course.shortname.match(/^(.+?)-\d{4}\/[12]-/i)?.[1]?.trim().toUpperCase();
}

function courseDisplayName(course: MoodleCourse): string {
  return course.fullname
    .replace(/\s+\([^)]*\)\s+-\s+.+$/u, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function curriculumIds(shortname: string): string[] {
  const scheduleAndCourses = shortname.split("--")[1] ?? "";
  return [
    ...new Set(
      scheduleAndCourses
        .split("-")
        .map((value) => value.trim().toUpperCase())
        .filter((value) => /^G[A-Z]{0,2}\d{3}$/.test(value)),
    ),
  ];
}

function timestampIso(value: unknown): string | undefined {
  const timestamp = numberValue(value);
  return timestamp && timestamp > 0 ? new Date(timestamp * 1000).toISOString() : undefined;
}

function dateFromModule(module: JsonObject, ids: string[]): string | undefined {
  for (const date of arrayValue(module.dates)) {
    const item = objectValue(date);
    if (typeof item?.dataid === "string" && ids.includes(item.dataid)) {
      const value = timestampIso(item.timestamp);
      if (value) return value;
    }
  }
  return undefined;
}

function browserFileUrl(apiUrl: string): string {
  return apiUrl.replace("/webservice/pluginfile.php/", "/pluginfile.php/");
}

function attachmentsFrom(value: unknown): TaskAttachment[] {
  return arrayValue(value).flatMap((entry) => {
    const file = objectValue(entry);
    const name = stringValue(file?.filename);
    const apiUrl = stringValue(file?.fileurl);
    if (!name || !apiUrl) return [];
    return [
      {
        name,
        apiUrl,
        browserUrl: browserFileUrl(apiUrl),
        ...(stringValue(file?.mimetype) ? { mimeType: stringValue(file?.mimetype) } : {}),
        ...(numberValue(file?.filesize) ? { size: numberValue(file?.filesize) } : {}),
      },
    ];
  });
}

function uniqueAttachments(attachments: TaskAttachment[]): TaskAttachment[] {
  return [...new Map(attachments.map((file) => [`${file.name}\n${file.apiUrl ?? ""}`, file])).values()];
}

export class MoodleClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly maximumAttachmentBytes: number;

  constructor(private readonly options: MoodleClientOptions) {
    this.baseUrl = campusBaseUrlFromCalendarUrl(options.calendarUrl);
    this.fetcher = options.fetcher ?? fetch;
    this.maximumAttachmentBytes = options.maximumAttachmentBytes ?? 10 * 1024 * 1024;
  }

  private async call(functionName: string, entries: Array<[string, string]> = []): Promise<unknown> {
    const body = new URLSearchParams({
      wstoken: this.options.token,
      wsfunction: functionName,
      moodlewsrestformat: "json",
    });
    for (const [name, value] of entries) body.append(name, value);

    const response = await this.fetcher(`${this.baseUrl}/webservice/rest/server.php`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = (await response.json()) as JsonObject;
    if (!response.ok || data.exception) {
      const message = stringValue(data.message) ?? `HTTP ${response.status}`;
      throw new Error(`Falha na API do Moodle em ${functionName}: ${message}`);
    }
    return data;
  }

  private async userCourses(): Promise<MoodleCourse[]> {
    const site = objectValue(await this.call("core_webservice_get_site_info"));
    const userId = numberValue(site?.userid);
    if (!userId) throw new Error("O Moodle nao informou o usuario associado ao token.");
    const courses = await this.call("core_enrol_get_users_courses", [["userid", String(userId)]]);
    return arrayValue(courses).flatMap((value) => {
      const course = objectValue(value);
      const id = numberValue(course?.id);
      const shortname = stringValue(course?.shortname);
      const fullname = stringValue(course?.fullname);
      return id && shortname && fullname ? [{ id, shortname, fullname }] : [];
    });
  }

  async getCurrentSemesterCourses(): Promise<MoodleCourseSummary[]> {
    const courses = (await this.userCourses()).flatMap((course) => {
      const code = courseCode(course);
      const period = course.shortname.match(/-(\d{4}\/[12])-/)?.[1];
      return code && period
        ? [{
            code,
            name: courseDisplayName(course),
            period,
            curriculumIds: curriculumIds(course.shortname),
          }]
        : [];
    });
    const currentPeriod = courses.map((course) => course.period).sort().at(-1);
    if (!currentPeriod) return [];
    return [
      ...new Map(
        courses
          .filter((course) => course.period === currentPeriod)
          .map((course) => [course.code, course]),
      ).values(),
    ].sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
  }

  async getActivities(requestedCourseCodes: string[]): Promise<MoodleActivity[]> {
    const requested = new Set(requestedCourseCodes.map((code) => code.toUpperCase()));
    if (requested.size === 0) return [];
    const courses = (await this.userCourses()).filter((course) => {
      const code = courseCode(course);
      return code ? requested.has(code) : false;
    });
    if (courses.length === 0) return [];

    const assignmentsData = objectValue(
      await this.call(
        "mod_assign_get_assignments",
        courses.map((course, index) => [`courseids[${index}]`, String(course.id)]),
      ),
    );
    const assignments = new Map<number, JsonObject>();
    for (const course of arrayValue(assignmentsData?.courses)) {
      for (const value of arrayValue(objectValue(course)?.assignments)) {
        const assignment = objectValue(value);
        const cmid = numberValue(assignment?.cmid);
        if (assignment && cmid) assignments.set(cmid, assignment);
      }
    }

    const contents = await Promise.all(
      courses.map(async (course) => ({
        course,
        sections: arrayValue(
          await this.call("core_course_get_contents", [["courseid", String(course.id)]]),
        ),
      })),
    );
    const activities: MoodleActivity[] = [];

    for (const { course, sections } of contents) {
      const code = courseCode(course);
      if (!code) continue;
      for (const sectionValue of sections) {
        const section = objectValue(sectionValue);
        const sectionName = stringValue(section?.name);
        for (const moduleValue of arrayValue(section?.modules)) {
          const module = objectValue(moduleValue);
          if (!module) continue;
          const moduleId = numberValue(module?.id);
          const name = stringValue(module?.name);
          if (!moduleId || !name || module?.visible === 0) continue;
          const assignment = assignments.get(moduleId);
          const attachments = uniqueAttachments([
            ...attachmentsFrom(module?.contents),
            ...attachmentsFrom(assignment?.introfiles),
            ...attachmentsFrom(assignment?.introattachments),
            ...attachmentsFrom(assignment?.submissionattachments),
          ]);
          const opensAt =
            timestampIso(assignment?.allowsubmissionsfromdate) ??
            dateFromModule(module, [
              "allowsubmissionsfromdate",
              "timeopen",
              "available",
              "submissionstart",
              "assessmentstart",
            ]);
          const dueAt =
            timestampIso(assignment?.duedate) ??
            dateFromModule(module, [
              "duedate",
              "timeclose",
              "deadline",
              "submissionend",
              "assessmentend",
            ]);
          activities.push({
            courseCode: code,
            courseName: courseDisplayName(course),
            moduleId,
            name,
            ...(sectionName ? { sectionName } : {}),
            attachments,
            ...(stringValue(module?.url) ? { url: stringValue(module?.url) } : {}),
            ...(htmlToPlainText(stringValue(assignment?.intro) ?? stringValue(module?.description))
              ? {
                  description: htmlToPlainText(
                    stringValue(assignment?.intro) ?? stringValue(module?.description),
                  ),
                }
              : {}),
            ...(opensAt ? { opensAt } : {}),
            ...(dueAt ? { dueAt } : {}),
          });
        }
      }
    }
    return activities;
  }

  async downloadAttachment(attachment: TaskAttachment): Promise<Uint8Array> {
    if (!attachment.apiUrl) throw new Error(`O anexo ${attachment.name} nao possui URL da API.`);
    const url = new URL(attachment.apiUrl);
    const base = new URL(this.baseUrl);
    const expectedPrefix = `${base.pathname.replace(/\/$/, "")}/webservice/pluginfile.php/`;
    if (url.origin !== base.origin || !url.pathname.startsWith(expectedPrefix)) {
      throw new Error(`URL de anexo nao confiavel: ${attachment.name}`);
    }
    url.searchParams.set("token", this.options.token);
    const response = await this.fetcher(url, { headers: { accept: attachment.mimeType ?? "*/*" } });
    if (!response.ok) throw new Error(`Falha ao baixar ${attachment.name}: HTTP ${response.status}`);
    const declaredSize = Number(response.headers.get("content-length") ?? attachment.size ?? 0);
    if (declaredSize > this.maximumAttachmentBytes) {
      throw new Error(`O anexo ${attachment.name} excede o limite de tamanho.`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > this.maximumAttachmentBytes) {
      throw new Error(`O anexo ${attachment.name} excede o limite de tamanho.`);
    }
    return bytes;
  }
}
