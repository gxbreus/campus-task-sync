import type { MoodleCourseSummary } from "../moodle/client.js";
import type { AttendanceCourse } from "../notion/setup-attendance.js";

function creditOverrides(value: string | undefined): Map<string, number> {
  const result = new Map<string, number>();
  for (const entry of value?.split(",") ?? []) {
    const [rawCode, rawCredits] = entry.split(/[=:]/, 2);
    const code = rawCode?.trim().toUpperCase();
    const credits = Number(rawCredits?.trim());
    if (!code || !Number.isInteger(credits) || credits <= 0) {
      throw new Error(
        `COURSE_CREDITS invalido em "${entry}". Use, por exemplo: GCC128=4,GCC175=2.`,
      );
    }
    result.set(code, credits);
  }
  return result;
}

export function coursesWithCredits(
  courses: MoodleCourseSummary[],
  configuredCredits: string | undefined,
  gradeCredits: ReadonlyMap<string, number>,
): AttendanceCourse[] {
  const overrides = creditOverrides(configuredCredits);
  const resolved = courses.map((course) => ({
    code: course.code,
    name: course.name,
    credits: overrides.get(course.code) ?? gradeCredits.get(course.code.toUpperCase()),
  }));
  const missing = resolved.filter((course) => !course.credits);
  if (missing.length > 0) {
    throw new Error(
      `Nao foi possivel identificar os creditos de: ${missing.map((course) => course.code).join(", ")}. ` +
      "Preencha COURSE_CREDITS no .env (exemplo: GCC128=4,GCC175=2).",
    );
  }
  return resolved.map((course) => ({ ...course, credits: course.credits! }));
}
