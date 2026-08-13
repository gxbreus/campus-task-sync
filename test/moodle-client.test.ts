import assert from "node:assert/strict";
import test from "node:test";

import {
  MoodleClient,
  htmlToPlainText,
} from "../src/moodle/client.js";

const calendarUrl =
  "https://campusvirtual.ufla.br/presencial/calendar/export_execute.php?token=calendar";

test("consulta atividades com datas, enunciado, link e anexos", async () => {
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("pluginfile.php")) {
      assert.match(url, /token=moodle-token/);
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-length": "3", "content-type": "application/pdf" },
      });
    }
    const body = new URLSearchParams(String(init?.body));
    switch (body.get("wsfunction")) {
      case "core_webservice_get_site_info":
        return Response.json({ userid: 42 });
      case "core_enrol_get_users_courses":
        return Response.json([
          {
            id: 10,
            shortname: "GCC220-2026/2--10A-G010",
            fullname: "Metodologia de Pesquisa (10A) - PROFESSOR",
          },
        ]);
      case "mod_assign_get_assignments":
        return Response.json({
          courses: [
            {
              id: 10,
              assignments: [
                {
                  cmid: 99,
                  intro: "<p>Leia o artigo.</p><ul><li>Responda às perguntas.</li></ul>",
                  allowsubmissionsfromdate: 1_786_935_600,
                  duedate: 1_787_626_740,
                  introattachments: [
                    {
                      filename: "artigo.pdf",
                      filesize: 3,
                      mimetype: "application/pdf",
                      fileurl:
                        "https://campusvirtual.ufla.br/presencial/webservice/pluginfile.php/1/mod_assign/introattachment/0/artigo.pdf",
                    },
                  ],
                },
              ],
            },
          ],
        });
      case "core_course_get_contents":
        return Response.json([
          {
            modules: [
              {
                id: 99,
                name: "Atividade Avaliativa 1",
                visible: 1,
                url: "https://campusvirtual.ufla.br/presencial/mod/assign/view.php?id=99",
                dates: [],
              },
              {
                id: 100,
                name: "Escolha o artigo clicando aqui",
                modname: "questionnaire",
                visible: 1,
                url: "https://campusvirtual.ufla.br/presencial/mod/questionnaire/view.php?id=100",
                dates: [],
              },
            ],
          },
        ]);
      default:
        throw new Error(`Funcao inesperada: ${body.get("wsfunction")}`);
    }
  };
  const client = new MoodleClient({ calendarUrl, token: "moodle-token", fetcher });

  const activities = await client.getActivities(["GCC220"]);

  assert.deepEqual(activities, [
    {
      courseCode: "GCC220",
      courseName: "Metodologia de Pesquisa",
      moduleId: 99,
      name: "Atividade Avaliativa 1",
      url: "https://campusvirtual.ufla.br/presencial/mod/assign/view.php?id=99",
      description: "Leia o artigo.\n\n- Responda às perguntas.",
      opensAt: "2026-08-17T03:00:00.000Z",
      dueAt: "2026-08-25T02:59:00.000Z",
      attachments: [
        {
          name: "artigo.pdf",
          size: 3,
          mimeType: "application/pdf",
          apiUrl:
            "https://campusvirtual.ufla.br/presencial/webservice/pluginfile.php/1/mod_assign/introattachment/0/artigo.pdf",
          browserUrl:
            "https://campusvirtual.ufla.br/presencial/pluginfile.php/1/mod_assign/introattachment/0/artigo.pdf",
        },
      ],
    },
    {
      courseCode: "GCC220",
      courseName: "Metodologia de Pesquisa",
      moduleId: 100,
      name: "Escolha o artigo clicando aqui",
      url: "https://campusvirtual.ufla.br/presencial/mod/questionnaire/view.php?id=100",
      attachments: [],
    },
  ]);
  assert.deepEqual(await client.downloadAttachment(activities[0]!.attachments[0]!),
    new Uint8Array([1, 2, 3]));
});

test("converte o HTML do Moodle em texto legivel", () => {
  assert.equal(
    htmlToPlainText("<h3>Instruções</h3><p>Leia&nbsp;o texto &amp; responda.</p>"),
    "Instruções\nLeia o texto & responda.",
  );
});

test("lista somente as disciplinas do semestre atual", async () => {
  const fetcher: typeof fetch = async (_input, init) => {
    const body = new URLSearchParams(String(init?.body));
    if (body.get("wsfunction") === "core_webservice_get_site_info") {
      return Response.json({ userid: 42 });
    }
    return Response.json([
      {
        id: 1,
        shortname: "GCC128-2026/2--10A-G010-G014",
        fullname: "Inteligência Artificial (10A) - PROFESSOR",
      },
      {
        id: 2,
        shortname: "GCC220-2026/2--14A",
        fullname: "Metodologia de Pesquisa (14A) - PROFESSOR",
      },
      {
        id: 3,
        shortname: "GCC101-2025/2--14A",
        fullname: "Disciplina Antiga (14A) - PROFESSOR",
      },
      { id: 4, shortname: "TutCV", fullname: "Tutorial Campus Virtual" },
    ]);
  };
  const client = new MoodleClient({ calendarUrl, token: "token", fetcher });

  assert.deepEqual(await client.getCurrentSemesterCourses(), [
    { code: "GCC128", name: "Inteligência Artificial", period: "2026/2", curriculumIds: ["G010", "G014"] },
    { code: "GCC220", name: "Metodologia de Pesquisa", period: "2026/2", curriculumIds: [] },
  ]);
});
