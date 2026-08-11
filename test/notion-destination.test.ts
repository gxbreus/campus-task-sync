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
          id: "page-1",
          properties: {
            "ID externo": { rich_text: [{ plain_text: "evento-1" }] },
            Situacao: { select: { name: "Concluida" } },
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
    { destinationId: "page-1", externalId: "evento-1", status: "completed" },
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
    fetcher,
    now: () => new Date("2026-08-11T12:00:00.000Z"),
  });

  await destination.create({
    externalId: "evento-1",
    title: "Trabalho",
    startsAt: "2026-08-20T23:59:00.000Z",
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
});
