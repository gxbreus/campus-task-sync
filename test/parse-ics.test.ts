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
      course: "Metodologia de Pesquisa",
      courseCode: "GCC220",
      sourceUrl: "https://campusvirtual.ufla.br/mod/assign/view.php?id=123",
      dueAt: "2026-08-20T23:59:00.000Z",
      openingInformation: "Data não informada pelo calendário do Campus",
    },
  ]);
});

test("une abertura e encerramento da mesma atividade", () => {
  const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:abertura-1
DTSTART:20260810T231900Z
SUMMARY:Escolha o artigo clicando aqui (Abertura da enquete)
DESCRIPTION:https://campusvirtual.ufla.br/mod/choice/view.php?id=10
CATEGORIES:GCC220-2026/2
END:VEVENT
BEGIN:VEVENT
UID:encerramento-1
DTSTART:20260817T025900Z
SUMMARY:Escolha o artigo clicando aqui (Encerramento da enquete)
DESCRIPTION:https://campusvirtual.ufla.br/mod/choice/view.php?id=10
CATEGORIES:GCC220-2026/2
END:VEVENT
END:VCALENDAR`;

  const tasks = parseCalendar(ics);
  assert.equal(tasks.length, 1);
  assert.match(tasks[0]?.externalId ?? "", /^campus-group-/);
  assert.deepEqual(tasks[0], {
    externalId: tasks[0]?.externalId,
    title: "Escolha o artigo clicando aqui",
    description: "https://campusvirtual.ufla.br/mod/choice/view.php?id=10",
    course: "Metodologia de Pesquisa",
    courseCode: "GCC220",
    sourceUrl: "https://campusvirtual.ufla.br/mod/choice/view.php?id=10",
    opensAt: "2026-08-10T23:19:00.000Z",
    dueAt: "2026-08-17T02:59:00.000Z",
    openingInformation: "Data de abertura informada pelo Campus",
  });
});

test("cria link para o evento do Campus quando o ICS nao fornece URL", () => {
  const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:347608@campusvirtual.ufla.br/presencial
DTSTART:20260819T020000Z
SUMMARY:Tarefa 1 está marcado(a) para esta data
DESCRIPTION:Leia o capitulo e responda.
CATEGORIES:GCC128-2026/2
END:VEVENT
END:VCALENDAR`;

  const [task] = parseCalendar(ics, { campusBaseUrl: "https://campusvirtual.ufla.br" });
  assert.equal(task?.course, "Inteligência Artificial");
  assert.equal(task?.title, "Tarefa 1");
  assert.equal(
    task?.sourceUrl,
    "https://campusvirtual.ufla.br/calendar/view.php?view=day&time=1787104800#event_347608",
  );
});

test("aceita calendario vazio", () => {
  const ics = "BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR";
  assert.deepEqual(parseCalendar(ics), []);
});
