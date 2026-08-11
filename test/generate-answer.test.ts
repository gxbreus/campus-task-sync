import assert from "node:assert/strict";
import test from "node:test";

import { createOpenAiAnswerGenerator } from "../src/ai/generate-answer.js";

test("gera uma sugestao com o perfil academico configurado", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const generator = createOpenAiAnswerGenerator({
    apiKey: "test-key",
    model: "gpt-test",
    fetcher: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: "Uma resposta natural e revisavel." }],
          },
        ],
      });
    },
  });

  const answer = await generator({
    externalId: "task-1",
    title: "Pesquisa sobre IA",
    description: "Pesquise uma aplicacao de inteligencia artificial.",
    course: "Inteligência Artificial",
    courseCode: "GCC128",
    dueAt: "2026-08-19T02:00:00.000Z",
    openingInformation: "Data não informada pelo calendário do Campus",
  });

  assert.equal(answer, "Uma resposta natural e revisavel.");
  assert.equal(requestBody?.model, "gpt-test");
  assert.deepEqual(requestBody?.tools, [{ type: "web_search" }]);
  assert.match(String(requestBody?.instructions), /7o periodo/);
  assert.match(JSON.stringify(requestBody?.input), /Pesquisa sobre IA/);
});
