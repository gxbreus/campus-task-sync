import assert from "node:assert/strict";
import test from "node:test";

import { setupAttendancePanel } from "../src/notion/setup-attendance.js";

type CapturedRequest = {
  url: string;
  method: string;
  body?: Record<string, unknown>;
};

test("cria painel com oito checkboxes e uma linha por disciplina", async () => {
  const requests: CapturedRequest[] = [];
  const fetcher: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    requests.push({ url, method: init.method ?? "GET", body });
    if (url.includes("/blocks/page-1/children")) return Response.json({ results: [] });
    if (url.endsWith("/databases") && init.method === "POST") {
      return Response.json({ id: "attendance-database" });
    }
    if (url.endsWith("/databases/attendance-database")) {
      return Response.json({ data_sources: [{ id: "attendance-source" }] });
    }
    if (url.endsWith("/data_sources/attendance-source/query")) {
      return Response.json({ results: [], next_cursor: null });
    }
    if (url.includes("/views?database_id=")) {
      return Response.json({ results: [{ id: "table-view" }] });
    }
    if (url.endsWith("/views/table-view") && init.method !== "PATCH") {
      return Response.json({ id: "table-view", type: "table" });
    }
    if (url.endsWith("/data_sources/attendance-source")) {
      return Response.json({
        properties: Object.fromEntries(
          [
            "Disciplina",
            ...Array.from({ length: 8 }, (_, index) => `Falta ${index + 1}`),
            "Faltas",
            "Restantes",
            "Status",
            "Codigo",
          ].map((name, index) => [name, { id: `property-${index}` }]),
        ),
      });
    }
    return Response.json({ id: "ok" });
  };

  const result = await setupAttendancePanel({
    token: "token",
    parentPageId: "page-1",
    courses: [
      { code: "GCC128", name: "Inteligência Artificial" },
      { code: "GCC220", name: "Metodologia de Pesquisa" },
    ],
    fetcher,
  });

  assert.deepEqual(result, {
    databaseId: "attendance-database",
    dataSourceId: "attendance-source",
    created: true,
    coursesCreated: 2,
  });
  const databaseRequest = requests.find(
    (request) => request.url.endsWith("/databases") && request.method === "POST",
  );
  const source = databaseRequest?.body?.initial_data_source as Record<string, unknown>;
  const properties = source.properties as Record<string, unknown>;
  for (let index = 1; index <= 8; index += 1) {
    assert.deepEqual(properties[`Falta ${index}`], { checkbox: {} });
  }
  assert.match(JSON.stringify(properties.Faltas), /Falta 8/);
  assert.equal(
    requests.filter((request) => request.url.endsWith("/pages") && request.method === "POST")
      .length,
    2,
  );
});

test("reutiliza painel existente e nao duplica disciplinas", async () => {
  let pageCreations = 0;
  const fetcher: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.includes("/blocks/page-1/children")) {
      return Response.json({
        results: [
          {
            id: "attendance-database",
            child_database: { title: "Controle de Faltas" },
          },
        ],
      });
    }
    if (url.endsWith("/databases/attendance-database")) {
      return Response.json({ data_sources: [{ id: "attendance-source" }] });
    }
    if (url.endsWith("/data_sources/attendance-source/query")) {
      return Response.json({
        results: [
          {
            properties: {
              Disciplina: { title: [{ plain_text: "Inteligência Artificial" }] },
            },
          },
        ],
      });
    }
    if (url.endsWith("/pages") && init.method === "POST") pageCreations += 1;
    if (url.includes("/views?database_id=")) return Response.json({ results: [] });
    return Response.json({ id: "ok" });
  };

  const result = await setupAttendancePanel({
    token: "token",
    parentPageId: "page-1",
    courses: [{ code: "GCC128", name: "Inteligência Artificial" }],
    fetcher,
  });

  assert.equal(result.created, false);
  assert.equal(result.coursesCreated, 0);
  assert.equal(pageCreations, 0);
});
