import assert from "node:assert/strict";
import test from "node:test";

import { coursesWithCredits } from "../src/attendance/course-credits.js";

test("permite corrigir creditos por disciplina no ambiente", () => {
  const courses = coursesWithCredits(
    [{ code: "GCC128", name: "Inteligência Artificial", period: "2026/2", curriculumIds: ["G014"] }],
    "GCC128=2",
    new Map([["GCC128", 4]]),
  );
  assert.deepEqual(courses, [
    { code: "GCC128", name: "Inteligência Artificial", credits: 2 },
  ]);
});

test("explica como configurar uma turma sem horario reconhecido", () => {
  assert.throws(
    () => coursesWithCredits(
      [{ code: "GCC999", name: "Tópicos Especiais", period: "2026/2", curriculumIds: [] }],
      undefined,
      new Map(),
    ),
    /COURSE_CREDITS/,
  );
});
