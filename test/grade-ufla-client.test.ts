import assert from "node:assert/strict";
import test from "node:test";

import { GradeUflaClient } from "../src/grade-ufla/client.js";

test("usa os creditos da matriz mais recente associada a turma", async () => {
  const csv = [
    '"curso","matriz","semestre","codigo","nome","creditos","tipo","subgrupo","preRequisitos","turmas"',
    '"G014","2015/02","6","GCC128","Inteligência Artificial","2","obrigatoria","","","[]"',
    '"G014","2023/01","6","GCC128","Inteligência Artificial","4","obrigatoria","","","[]"',
    '"G999","2025/01","6","GCC128","Outra grade, com vírgula","6","eletiva","","","[]"',
  ].join("\n");
  const fetcher: typeof fetch = async () => new Response(csv);
  const credits = await new GradeUflaClient(fetcher).latestCredits([
    {
      code: "GCC128",
      name: "Inteligência Artificial",
      period: "2026/2",
      curriculumIds: ["G014"],
    },
  ]);
  assert.equal(credits.get("GCC128"), 4);
});
