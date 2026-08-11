import assert from "node:assert/strict";
import test from "node:test";

import { enrichTasksWithMoodle } from "../src/moodle/enrich-tasks.js";

test("substitui dados incompletos do calendario pelos detalhes da atividade", async () => {
  const tasks = await enrichTasksWithMoodle(
    [
      {
        externalId: "event-1",
        title: "Atividade Avaliativa 1",
        course: "GCC220",
        courseCode: "GCC220",
        dueAt: "2026-08-25T02:59:00.000Z",
        sourceUrl: "https://campusvirtual.ufla.br/presencial/calendar/view.php",
        openingInformation: "Data não informada pelo calendário do Campus",
      },
    ],
    {
      async getActivities(courseCodes) {
        assert.deepEqual(courseCodes, ["GCC220"]);
        return [
          {
            courseCode: "GCC220",
            courseName: "Metodologia de Pesquisa",
            moduleId: 99,
            name: "Atividade Avaliativa 1",
            url: "https://campusvirtual.ufla.br/presencial/mod/assign/view.php?id=99",
            description: "Leia o artigo e responda.",
            opensAt: "2026-08-17T03:00:00.000Z",
            dueAt: "2026-08-25T02:59:00.000Z",
            attachments: [
              {
                name: "artigo.pdf",
                browserUrl:
                  "https://campusvirtual.ufla.br/presencial/pluginfile.php/1/artigo.pdf",
              },
            ],
          },
        ];
      },
    },
  );

  assert.deepEqual(tasks, [
    {
      externalId: "event-1",
      title: "Atividade Avaliativa 1",
      course: "Metodologia de Pesquisa",
      courseCode: "GCC220",
      sourceUrl: "https://campusvirtual.ufla.br/presencial/mod/assign/view.php?id=99",
      description:
        "Leia o artigo e responda.\n\nAnexos:\n- artigo.pdf: https://campusvirtual.ufla.br/presencial/pluginfile.php/1/artigo.pdf",
      opensAt: "2026-08-17T03:00:00.000Z",
      dueAt: "2026-08-25T02:59:00.000Z",
      attachments: [
        {
          name: "artigo.pdf",
          browserUrl: "https://campusvirtual.ufla.br/presencial/pluginfile.php/1/artigo.pdf",
        },
      ],
      openingInformation: "Data obtida diretamente da atividade no Campus",
    },
  ]);
});
