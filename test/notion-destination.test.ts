import assert from "node:assert/strict";
import test from "node:test";

import { NotionDestination } from "../src/notion/notion-destination.js";

type CapturedRequest = {
  url: string;
  init?: RequestInit;
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("lista apenas tarefas gerenciadas e interpreta a situacao", async () => {
  const requests: CapturedRequest[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    return jsonResponse({
      results: [
        {
          id: "page-in-trash",
          in_trash: true,
          properties: {
            "ID externo": { rich_text: [{ plain_text: "evento-antigo" }] },
            Concluida: { checkbox: false },
            Situacao: { select: { name: "Pendente" } },
          },
        },
        {
          id: "page-1",
          properties: {
            "ID externo": { rich_text: [{ plain_text: "evento-1" }] },
            Concluida: { checkbox: true },
            Situacao: { select: { name: "Pendente" } },
          },
        },
      ],
      next_cursor: null,
    });
  };
  const destination = new NotionDestination({
    token: "test-token",
    dataSourceId: "source-1",
    fetcher,
  });

  assert.deepEqual(await destination.listManagedTasks(), [
    {
      destinationId: "page-1",
      externalId: "evento-1",
      status: "completed",
      hasSuggestedAnswer: false,
    },
  ]);
  assert.equal(requests[0]?.url, "https://api.notion.com/v1/data_sources/source-1/query");
  assert.match(String(requests[0]?.init?.body), /Campus Virtual/);
});

test("cria uma pagina com identificador externo e prazo", async () => {
  let body: Record<string, unknown> | undefined;
  const fetcher: typeof fetch = async (_input, init) => {
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return jsonResponse({ id: "page-created" });
  };
  const destination = new NotionDestination({
    token: "test-token",
    dataSourceId: "source-1",
    assigneeUserId: "user-1",
    answerGenerator: async () => "Resposta sugerida para revisar.",
    fetcher,
    now: () => new Date("2026-08-11T12:00:00.000Z"),
  });

  await destination.create({
    externalId: "evento-1",
    title: "Trabalho",
    opensAt: "2026-08-15T12:00:00.000Z",
    dueAt: "2026-08-20T23:59:00.000Z",
    course: "Metodologia de Pesquisa",
    courseCode: "GCC220",
    openingInformation: "Data de abertura informada pelo Campus",
  });

  assert.deepEqual(body?.parent, {
    type: "data_source_id",
    data_source_id: "source-1",
  });
  const properties = body?.properties as Record<string, unknown>;
  assert.deepEqual(properties["ID externo"], {
    rich_text: [{ text: { content: "evento-1" } }],
  });
  assert.deepEqual(properties.Situacao, { select: { name: "Pendente" } });
  assert.deepEqual(properties.Concluida, { checkbox: false });
  assert.deepEqual(properties.Nome, {
    title: [{ text: { content: "Metodologia de Pesquisa — Trabalho" } }],
  });
  assert.deepEqual(properties.Disciplina, { select: { name: "Metodologia de Pesquisa" } });
  assert.deepEqual(properties.Abertura, { date: { start: "2026-08-15T12:00:00.000Z" } });
  assert.deepEqual(properties.Prazo, { date: { start: "2026-08-20T23:59:00.000Z" } });
  assert.deepEqual(properties.Alerta, { select: { name: "🟢 No prazo" } });
  assert.deepEqual(properties.Responsavel, { people: [{ id: "user-1" }] });
  assert.deepEqual(properties["Informação da abertura"], {
    rich_text: [
      { type: "text", text: { content: "Data de abertura informada pelo Campus" } },
    ],
  });
  assert.deepEqual(properties["Sugestão de resposta"], {
    rich_text: [
      { type: "text", text: { content: "Resposta sugerida para revisar." } },
    ],
  });
});

test("nao apaga uma abertura confirmada quando o calendario nao informa a data", async () => {
  let body: Record<string, unknown> | undefined;
  const destination = new NotionDestination({
    token: "test-token",
    dataSourceId: "source-1",
    fetcher: async (_input, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse({ id: "page-1" });
    },
    now: () => new Date("2026-08-11T12:00:00.000Z"),
  });

  await destination.update(
    "page-1",
    {
      externalId: "evento-1",
      title: "Tarefa 1",
      course: "Inteligência Artificial",
      dueAt: "2026-08-19T02:00:00.000Z",
      openingInformation: "Data não informada pelo calendário do Campus",
    },
    {
      destinationId: "page-1",
      externalId: "evento-1",
      status: "pending",
      hasSuggestedAnswer: false,
    },
  );

  const properties = body?.properties as Record<string, unknown>;
  assert.equal("Abertura" in properties, false);
  assert.equal("Informação da abertura" in properties, false);
});
