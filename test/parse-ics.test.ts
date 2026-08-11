import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseCalendar } from "../src/calendar/parse-ics.js";

test("converte um evento do Moodle em tarefa", async () => {
  const ics = await readFile(new URL("./fixtures/calendar.ics", import.meta.url), "utf8");

  assert.deepEqual(parseCalendar(ics), [
    {
      externalId: "atividade-123@campusvirtual.ufla.br",
      title: "Entrega da atividade 1",
      description:
        "Leia o enunciado e envie o trabalho.\nhttps://campusvirtual.ufla.br/mod/assign/view.php?id=123",
      course: "GCC220",
      sourceUrl: "https://campusvirtual.ufla.br/mod/assign/view.php?id=123",
      startsAt: "2026-08-20T23:59:00.000Z",
      endsAt: "2026-08-21T00:00:00.000Z",
    },
  ]);
});

test("aceita calendario vazio", () => {
  const ics = "BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR";
  assert.deepEqual(parseCalendar(ics), []);
});
