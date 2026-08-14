import assert from "node:assert/strict";
import test from "node:test";

import {
  IMPORTANT_DATES_2026_2,
  PLANNED_ABSENCES_2026_2,
} from "../src/plans/semester-2026-2.js";

test("registra todas as avaliações do plano de Grafos", () => {
  const graphDates = IMPORTANT_DATES_2026_2.filter((date) => date.courseCode === "GCC262");

  assert.equal(graphDates.length, 10);
  assert.deepEqual(
    graphDates.map((date) => [date.title, date.start, date.weight]),
    [
      ["Entrega — Lista 1", "2026-09-10", 1],
      ["Prova 1", "2026-09-16", 30],
      ["Entrega — Programa 1", "2026-09-16", 2],
      ["Entrega — Lista 2", "2026-10-21", 1],
      ["Prova 2", "2026-10-22", 30],
      ["Entrega — Programa 2", "2026-10-22", 3],
      ["Entrega — Lista 3", "2026-12-03", 1],
      ["Prova 3", "2026-12-09", 30],
      ["Entrega — Programa 3", "2026-12-09", 2],
      ["Avaliação adicional", "2026-12-16", undefined],
    ],
  );
});

test("considera somente as aulas de Grafos durante a viagem", () => {
  const graphAbsences = PLANNED_ABSENCES_2026_2.find((item) => item.courseCode === "GCC262");
  assert.deepEqual(graphAbsences?.dates, ["2026-10-21", "2026-10-22"]);
});
