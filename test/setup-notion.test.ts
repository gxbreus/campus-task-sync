import assert from "node:assert/strict";
import test from "node:test";

import { parseNotionPageId, setupNotion } from "../src/notion/setup-notion.js";

test("extrai o ID no fim de uma URL cujo titulo contem letras hexadecimais", () => {
  assert.equal(
    parseNotionPageId(
      "https://www.notion.so/Campus-Task-Sync-0123456789abcdef0123456789abcdef",
    ),
    "0123456789abcdef0123456789abcdef",
  );
});

test("cria base com checkbox, cursos coloridos e visualizacoes", async () => {
  const requests: Array<{ url: string; method: string; body?: Record<string, unknown> }> = [];
  let savedId: string | undefined;
  let savedAssigneeId: string | undefined;
  const fetcher: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    requests.push({ url, method: init.method ?? "GET", body });

    if (url.endsWith("/databases") && init.method === "POST") {
      return Response.json({ id: "database-1" });
    }
    if (url.endsWith("/databases/database-1")) {
      return Response.json({ data_sources: [{ id: "source-1" }] });
    }
    if (url.endsWith("/data_sources/source-1")) {
      return Response.json({
        parent: { database_id: "database-1" },
        properties: {
          Disciplina: { id: "course-property" },
          Prazo: { id: "deadline-property" },
          Nome: { id: "title" },
          Abertura: { id: "opening-property" },
          "Informação da abertura": { id: "opening-info-property" },
          Alerta: { id: "alert-property" },
          Concluida: { id: "done-property" },
          Link: { id: "link-property" },
          Descricao: { id: "description-property" },
          "Sugestão de resposta": { id: "answer-property" },
          Responsavel: { id: "assignee-property" },
        },
      });
    }
    if (url.includes("/views?database_id=")) {
      return Response.json({ results: [{ id: "default-view" }] });
    }
    if (url.endsWith("/views/default-view") && init.method !== "PATCH") {
      return Response.json({ id: "default-view", name: "Default view", type: "table" });
    }
    if (url.includes("/users?page_size=")) {
      return Response.json({ results: [{ id: "user-1", type: "person" }] });
    }
    return Response.json({ id: "ok" });
  };

  const result = await setupNotion({
    token: "test-token",
    parentPageUrl:
      "https://www.notion.so/Campus-Task-Sync-0123456789abcdef0123456789abcdef",
    courses: ["GCC220", "GCC220", "GCC101"],
    fetcher,
    saveDataSourceId: async (id) => {
      savedId = id;
    },
    saveAssigneeUserId: async (id) => {
      savedAssigneeId = id;
    },
  });

  assert.equal(savedId, "source-1");
  assert.equal(savedAssigneeId, "user-1");
  assert.equal(result.created, true);
  assert.deepEqual(result.viewsCreated, ["Por disciplina", "Calendario", "Pendentes", "Arquivadas"]);

  const createDatabase = requests.find(
    (request) => request.url.endsWith("/databases") && request.method === "POST",
  );
  const initialDataSource = createDatabase?.body?.initial_data_source as Record<string, unknown>;
  const properties = initialDataSource.properties as Record<string, unknown>;
  assert.deepEqual(properties.Concluida, { checkbox: {} });
  assert.deepEqual(properties.Abertura, { date: {} });
  assert.deepEqual(properties["Informação da abertura"], { rich_text: {} });
  assert.deepEqual(properties["Sugestão de resposta"], { rich_text: {} });
  assert.ok("select" in (properties.Alerta as Record<string, unknown>));
  assert.deepEqual(properties.Responsavel, { people: {} });

  const updateDefaultView = requests.find(
    (request) => request.url.endsWith("/views/default-view") && request.method === "PATCH",
  );
  const configuration = updateDefaultView?.body?.configuration as Record<string, unknown>;
  const columns = configuration.properties as Array<Record<string, unknown>>;
  assert.equal(columns[0]?.property_id, "done-property");
  assert.equal(columns[1]?.property_id, "course-property");
  assert.equal(columns.filter((column) => column.visible === true).at(-1)?.property_id, "answer-property");
  assert.deepEqual(updateDefaultView?.body?.filter, {
    and: [
      { property: "Concluida", checkbox: { equals: false } },
      { property: "Situacao", select: { does_not_equal: "Cancelada" } },
    ],
  });
  assert.deepEqual(properties.Disciplina, {
    select: {
      options: [
        { name: "GCC101", color: "blue" },
        { name: "GCC220", color: "green" },
      ],
    },
  });
  const board = requests.find(
    (request) => request.url.endsWith("/views") && request.body?.name === "Por disciplina",
  );
  assert.deepEqual(board?.body?.filter, {
    and: [
      { property: "Concluida", checkbox: { equals: false } },
      { property: "Situacao", select: { does_not_equal: "Cancelada" } },
    ],
  });
  const archived = requests.find(
    (request) => request.url.endsWith("/views") && request.body?.name === "Arquivadas",
  );
  assert.deepEqual(archived?.body?.filter, {
    property: "Concluida",
    checkbox: { equals: true },
  });
});

test("retoma uma configuracao parcial sem duplicar a base ou as visualizacoes", async () => {
  const requests: Array<{ url: string; method: string; body?: Record<string, unknown> }> = [];
  const fetcher: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    requests.push({ url, method: init.method ?? "GET", body });

    if (url.endsWith("/data_sources/source-1")) {
      return Response.json({
        parent: { database_id: "database-1" },
        properties: {
          Disciplina: { id: "course-property" },
          Prazo: { id: "deadline-property" },
        },
      });
    }
    if (url.includes("/views?database_id=")) {
      return Response.json({ results: [{ id: "existing-view" }] });
    }
    if (url.endsWith("/views/existing-view")) {
      return Response.json({ id: "existing-view", name: "Por disciplina" });
    }
    return Response.json({ id: "ok" });
  };

  const result = await setupNotion({
    token: "test-token",
    parentPageUrl:
      "https://www.notion.so/Campus-Task-Sync-0123456789abcdef0123456789abcdef",
    courses: ["GCC220"],
    existingDataSourceId: "source-1",
    fetcher,
  });

  assert.equal(result.created, false);
  assert.deepEqual(result.viewsCreated, ["Calendario", "Pendentes", "Arquivadas"]);
  assert.equal(
    requests.filter((request) => request.url.endsWith("/databases") && request.method === "POST")
      .length,
    0,
  );
});
