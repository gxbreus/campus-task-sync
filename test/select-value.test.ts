import assert from "node:assert/strict";
import test from "node:test";

import { notionSelectValue } from "../src/notion/select-value.js";

test("converte virgulas em separadores aceitos pelo select do Notion", () => {
  assert.equal(
    notionSelectValue("Tópicos Especiais, Segurança, Redes e Sistemas"),
    "Tópicos Especiais · Segurança · Redes e Sistemas",
  );
});

test("preserva nomes de disciplinas que já são válidos", () => {
  assert.equal(notionSelectValue("Inteligência Artificial"), "Inteligência Artificial");
});

