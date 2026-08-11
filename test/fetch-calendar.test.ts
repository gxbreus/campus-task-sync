import assert from "node:assert/strict";
import test from "node:test";

import { fetchCalendar } from "../src/calendar/fetch-calendar.js";

test("preserva o caminho do Campus ao criar o link do evento", async () => {
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
  const tasks = await fetchCalendar(
    "https://campusvirtual.ufla.br/presencial/calendar/export_execute.php?token=test",
    async () => new Response(ics),
  );

  assert.equal(
    tasks[0]?.sourceUrl,
    "https://campusvirtual.ufla.br/presencial/calendar/view.php?view=day&time=1787104800#event_347608",
  );
});
