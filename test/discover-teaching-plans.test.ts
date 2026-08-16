import assert from "node:assert/strict";
import test from "node:test";

import { datesForPeriod, isTeachingPlan } from "../src/plans/discover-teaching-plans.js";
import type { MoodleActivity } from "../src/moodle/client.js";

const activity: MoodleActivity = {
  courseCode: "GCC128",
  courseName: "Inteligência Artificial",
  moduleId: 1,
  name: "Plano de aula (2026-02)",
  attachments: [],
};

test("aceita plano de aula em PDF como plano de ensino", () => {
  assert.equal(isTeachingPlan(activity, { name: "gcc128_2026_2.pdf" }), true);
  assert.equal(isTeachingPlan({ ...activity, name: "Slides" }, { name: "aula-1.pdf" }), false);
});

test("mantém somente datas do semestre atual da disciplina", () => {
  const base = {
    courseCode: "GCC128",
    courseName: "Inteligência Artificial",
    title: "Prova 1",
    type: "Prova" as const,
    start: "2026-09-01",
  };
  assert.deepEqual(
    datesForPeriod([
      { ...base, id: "2024-2:GCC128:plano:prova-1" },
      { ...base, id: "2026-2:GCC128:plano:prova-1" },
    ], "2026/2").map((date) => date.id),
    ["2026-2:GCC128:plano:prova-1"],
  );
});
