import type { MoodleActivity, MoodleCourseSummary } from "../moodle/client.js";
import type { TaskAttachment } from "../domain/task.js";
import { extractPdfText } from "./pdf-text.js";
import { parseTeachingPlanText } from "./parse-teaching-plan.js";
import type { ImportantDate } from "./types.js";

type MoodlePlanSource = {
  getActivities(courseCodes: string[]): Promise<MoodleActivity[]>;
  downloadAttachment(attachment: TaskAttachment): Promise<Uint8Array>;
};

export type TeachingPlansResult = {
  dates: ImportantDate[];
  plansFound: number;
  plansParsed: number;
};

function normalized(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function isTeachingPlan(activity: MoodleActivity, attachment: TaskAttachment): boolean {
  const label = normalized(`${activity.name} ${attachment.name}`);
  return attachment.name.toLowerCase().endsWith(".pdf") && /plano\s+(?:de\s+)?(?:ensino|curso|aula)/.test(label);
}

export function datesForPeriod(dates: ImportantDate[], period: string): ImportantDate[] {
  const prefix = `${period.replace("/", "-")}:`;
  return dates.filter((date) => date.id.startsWith(prefix));
}

export async function discoverTeachingPlans(
  moodle: MoodlePlanSource,
  courses: MoodleCourseSummary[],
): Promise<TeachingPlansResult> {
  const byCode = new Map(courses.map((course) => [course.code, course]));
  const activities = await moodle.getActivities(courses.map((course) => course.code));
  const plans = activities.flatMap((activity) =>
    activity.attachments
      .filter((attachment) => isTeachingPlan(activity, attachment))
      .map((attachment) => ({ activity, attachment })),
  );
  const dates: ImportantDate[] = [];
  let plansParsed = 0;
  for (const { activity, attachment } of plans) {
    const course = byCode.get(activity.courseCode);
    if (!course) continue;
    try {
      const text = await extractPdfText(await moodle.downloadAttachment(attachment));
      const parsed = datesForPeriod(parseTeachingPlanText(text, course), course.period);
      if (parsed.length > 0) plansParsed += 1;
      dates.push(...parsed);
    } catch {
      // Um material inválido não deve impedir a sincronização dos demais cursos.
    }
  }
  return {
    dates: [...new Map(dates.map((date) => [date.id, date])).values()],
    plansFound: plans.length,
    plansParsed,
  };
}
