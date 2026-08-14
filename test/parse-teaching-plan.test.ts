import assert from "node:assert/strict";
import test from "node:test";

import { parseTeachingPlanText } from "../src/plans/parse-teaching-plan.js";

const plan = `
UNIVERSIDADE FEDERAL DE LAVRAS
PLANO DE ENSINO
Código: ABC123                    Nome: Teoria, Cultura e Sociedade
Semestre: 2026/2                  Turma: 10A
Atividades Avaliativas: Projeto #01: 20%; Prova 1: 30%; Trabalho Final: 50%;
Dados da Ementa
Cronograma de Atividades
Dia Data Descrição
1 01/09/2026 Projeto #01 (Pesquisa inicial)
2 02/09/2026 Projeto #01 (Pesquisa inicial)
3 15/10/2026 PROVA1 [entrega: TRABALHO FINAL]
`;

test("extrai avaliações do formato oficial e une datas repetidas", () => {
  const result = parseTeachingPlanText(plan, {
    code: "ABC123",
    name: "Teoria, Cultura e Sociedade",
    period: "2026/2",
  });

  assert.deepEqual(
    result.map(({ title, start, end, weight }) => [title, start, end, weight]),
    [
      ["Projeto #01 (Pesquisa inicial)", "2026-09-01", "2026-09-02", 20],
      ["Entrega — TRABALHO FINAL", "2026-10-15", undefined, 50],
      ["PROVA1", "2026-10-15", undefined, 30],
    ],
  );
  assert.match(result[0]?.id ?? "", /^2026-2:ABC123:plano:/);
});

test("não inventa datas quando o documento não é um plano reconhecido", () => {
  assert.deepEqual(
    parseTeachingPlanText("Material de apoio sem cronograma", {
      code: "ABC123",
      name: "Teoria, Cultura e Sociedade",
      period: "2026/2",
    }),
    [],
  );
});
