import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  campusBaseUrlFromCalendarUrl,
  requestMoodleToken,
  saveEnvMoodleToken,
  validateMoodleToken,
} from "../src/moodle/auth.js";

test("identifica a raiz presencial do Campus", () => {
  assert.equal(
    campusBaseUrlFromCalendarUrl(
      "https://campusvirtual.ufla.br/presencial/calendar/export_execute.php?token=test",
    ),
    "https://campusvirtual.ufla.br/presencial",
  );
});

test("rejeita dominio falso antes de transmitir credenciais", async () => {
  let requested = false;
  const fetcher: typeof fetch = async () => {
    requested = true;
    return Response.json({ token: "nao-deveria-ser-emitido" });
  };

  await assert.rejects(
    requestMoodleToken({
      calendarUrl: "https://campusvirtual.ufla.br.exemplo.com/presencial/calendar/export.php",
      username: "estudante",
      password: "senha-local",
      fetcher,
    }),
    /URL do Campus nao confiavel/,
  );
  assert.equal(requested, false);
});

test("exige HTTPS e o caminho de calendario oficial", () => {
  assert.throws(
    () => campusBaseUrlFromCalendarUrl(
      "http://campusvirtual.ufla.br/presencial/calendar/export.php",
    ),
    /URL do Campus nao confiavel/,
  );
  assert.throws(
    () => campusBaseUrlFromCalendarUrl("https://campusvirtual.ufla.br/presencial/curso"),
    /caminho do calendario nao foi encontrado/,
  );
});

test("solicita e valida um token sem expor as credenciais", async () => {
  const requests: Array<{ url: string; body: string }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), body: String(init?.body) });
    if (String(input).endsWith("/login/token.php")) return Response.json({ token: "token-test" });
    return Response.json({ userid: 123 });
  };
  const calendarUrl =
    "https://campusvirtual.ufla.br/presencial/calendar/export_execute.php?token=test";
  const token = await requestMoodleToken({
    calendarUrl,
    username: "estudante",
    password: "senha-local",
    fetcher,
  });
  await validateMoodleToken(calendarUrl, token, fetcher);

  assert.equal(token, "token-test");
  assert.match(requests[0]?.body ?? "", /service=moodle_mobile_app/);
  assert.match(requests[1]?.body ?? "", /core_webservice_get_site_info/);
});

test("salva somente o token no .env e restringe a permissao do arquivo", async () => {
  const directory = await mkdtemp(join(tmpdir(), "campus-task-sync-"));
  const envPath = join(directory, ".env");
  await writeFile(envPath, "CALENDAR_ICS_URL=https://exemplo\nMOODLE_TOKEN=antigo\n", {
    mode: 0o644,
  });

  await saveEnvMoodleToken("token-novo", envPath);

  const contents = await readFile(envPath, "utf8");
  const metadata = await stat(envPath);
  assert.equal(
    contents,
    "CALENDAR_ICS_URL=https://exemplo\nMOODLE_TOKEN=token-novo\n",
  );
  assert.equal(metadata.mode & 0o777, 0o600);
});
