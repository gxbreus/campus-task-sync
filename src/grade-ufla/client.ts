import type { MoodleCourseSummary } from "../moodle/client.js";

const DEFAULT_SUBJECTS_URL = "https://gradeufla.com.br/data/subjects.csv";

export type GradeUflaSubject = {
  course: string;
  matrix: string;
  code: string;
  name: string;
  credits: number;
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function matrixOrder(matrix: string): number {
  const match = matrix.match(/(\d{4})\D*(\d{1,2})/);
  return match ? Number(match[1]) * 100 + Number(match[2]) : 0;
}

export function parseGradeUflaSubjects(csv: string): GradeUflaSubject[] {
  const [headers = [], ...rows] = parseCsv(csv);
  const positions = new Map(headers.map((header, index) => [header.trim().toLowerCase(), index]));
  const at = (row: string[], name: string): string => row[positions.get(name) ?? -1]?.trim() ?? "";
  return rows.flatMap((row) => {
    const course = at(row, "curso");
    const matrix = at(row, "matriz");
    const code = at(row, "codigo").toUpperCase();
    const name = at(row, "nome");
    const credits = Number(at(row, "creditos"));
    return course && matrix && code && Number.isInteger(credits) && credits > 0
      ? [{ course, matrix, code, name, credits }]
      : [];
  });
}

export class GradeUflaClient {
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly subjectsUrl = DEFAULT_SUBJECTS_URL,
  ) {}

  async latestCredits(courses: MoodleCourseSummary[]): Promise<Map<string, number>> {
    const response = await this.fetcher(this.subjectsUrl);
    if (!response.ok) {
      throw new Error(`Grade UFLA indisponivel (HTTP ${response.status}).`);
    }
    const subjects = parseGradeUflaSubjects(await response.text());
    const result = new Map<string, number>();
    for (const course of courses) {
      const byCode = subjects.filter((subject) => subject.code === course.code.toUpperCase());
      const curriculumIds = new Set(course.curriculumIds ?? []);
      const relevant = byCode.filter((subject) => curriculumIds.has(subject.course));
      const candidates = relevant.length > 0 ? relevant : byCode;
      const latest = candidates.sort(
        (left, right) => matrixOrder(right.matrix) - matrixOrder(left.matrix),
      )[0];
      if (latest) result.set(course.code.toUpperCase(), latest.credits);
    }
    return result;
  }
}
