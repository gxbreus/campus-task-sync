import assert from "node:assert/strict";
import test from "node:test";

import { markPlannedAbsences } from "../src/notion/mark-planned-absences.js";
import { setupImportantDatesPanel } from "../src/notion/setup-important-dates.js";

test("cria painel idempotente e destaca avaliação durante a viagem", async () => {
  const bodies: Array<Record<string, unknown>> = [];
  const fetcher: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    if (init.body) bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
    if (url.includes("/blocks/page-1/children")) return Response.json({ results: [] });
    if (url.endsWith("/databases") && init.method === "POST") return Response.json({ id: "dates-db" });
    if (url.endsWith("/databases/dates-db")) return Response.json({ data_sources: [{ id: "dates-source" }] });
    if (url.endsWith("/data_sources/dates-source/query")) return Response.json({ results: [] });
    if (url.endsWith("/data_sources/dates-source")) return Response.json({ properties: { Data: { id: "data-id" } } });
    if (url.includes("/views?database_id=")) return Response.json({ results: [] });
    return Response.json({ id: "ok" });
  };

  const result = await setupImportantDatesPanel({
    token: "token",
    parentPageId: "page-1",
    travel: { start: "2026-10-12", end: "2026-10-24" },
    dates: [{
      id: "event-1",
      courseCode: "GCC128",
      courseName: "Inteligência Artificial",
      title: "Projeto #04",
      type: "Trabalho",
      start: "2026-10-13",
      end: "2026-10-14",
      weight: 15,
    }],
    fetcher,
  });

  assert.equal(result.entriesCreated, 1);
  const page = bodies.find((body) => object(body.parent)?.type === "data_source_id");
  const properties = object(page?.properties);
  assert.equal(object(properties?.Viagem)?.select && object(object(properties?.Viagem)?.select)?.name, "✈️ Durante a viagem");
  assert.equal(object(properties?.Peso)?.number, 15);
});

test("registra apenas faltas planejadas ainda não aplicadas", async () => {
  let pagePatch: Record<string, unknown> | undefined;
  const fetcher: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.endsWith("/data_sources/attendance")) {
      return Response.json({ properties: { "Ausências planejadas": { id: "planned" } } });
    }
    if (url.endsWith("/data_sources/attendance/query")) {
      return Response.json({ results: [{
        id: "course-page",
        properties: {
          Codigo: { rich_text: [{ plain_text: "GCC128" }] },
          "Ausências planejadas": { rich_text: [{ plain_text: "2026-10-13" }] },
          "Falta 1": { checkbox: true },
          ...Object.fromEntries(Array.from({ length: 7 }, (_, index) => [`Falta ${index + 2}`, { checkbox: false }])),
        },
      }] });
    }
    if (url.endsWith("/pages/course-page") && init.body) pagePatch = JSON.parse(String(init.body)) as Record<string, unknown>;
    return Response.json({ id: "ok" });
  };

  const updated = await markPlannedAbsences({
    token: "token",
    dataSourceId: "attendance",
    absences: [{
      courseCode: "GCC128",
      courseName: "Inteligência Artificial",
      dates: ["2026-10-13", "2026-10-14", "2026-10-20"],
    }],
    fetcher,
  });

  assert.equal(updated, 1);
  const properties = object(pagePatch?.properties);
  assert.deepEqual(properties?.["Falta 2"], { checkbox: true });
  assert.deepEqual(properties?.["Falta 3"], { checkbox: true });
  assert.equal(properties?.["Falta 4"], undefined);
});

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
}

