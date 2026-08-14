import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { POST } from "../apps/web/app/api/calendar/validate/route.js";
import { securityHeaders } from "../apps/web/next.config.js";

const endpoint = "https://campus-task-sync.vercel.app/api/calendar/validate";
const calendarUrl =
  "https://campusvirtual.ufla.br/presencial/calendar/export_execute.php?token=segredo-local";
const validCalendar = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nEND:VEVENT\nEND:VCALENDAR";

function request(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

test("valida o calendario sem seguir redirecionamentos ou permitir cache", async () => {
  const originalFetch = globalThis.fetch;
  let fetchOptions: RequestInit | undefined;
  globalThis.fetch = async (_input, init) => {
    fetchOptions = init;
    return new Response(validCalendar, {
      headers: { "content-type": "text/calendar" },
    });
  };

  try {
    const response = await POST(request({ url: calendarUrl }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
    assert.equal(fetchOptions?.redirect, "error");
    assert.equal(fetchOptions?.cache, "no-store");
    assert.ok(fetchOptions?.signal instanceof AbortSignal);
    assert.deepEqual(await response.json(), { valid: true, events: 1 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejeita dominio, porta, credenciais e caminho que nao sejam oficiais", async () => {
  const unsafeUrls = [
    "https://campusvirtual.ufla.br.exemplo.com/presencial/calendar/export_execute.php?token=x",
    "https://campusvirtual.ufla.br:444/presencial/calendar/export_execute.php?token=x",
    "https://usuario:senha@campusvirtual.ufla.br/presencial/calendar/export_execute.php?token=x",
    "https://campusvirtual.ufla.br/presencial/calendar/atalho/export_execute.php?token=x",
  ];

  for (const url of unsafeUrls) {
    const response = await POST(request({ url }));
    assert.equal(response.status, 400);
  }
});

test("rejeita origem externa, formato incorreto e corpo acima do limite", async () => {
  const external = await POST(request({ url: calendarUrl }, { origin: "https://site-malicioso.example" }));
  assert.equal(external.status, 403);

  const wrongType = await POST(new Request(endpoint, { method: "POST", body: "url=x" }));
  assert.equal(wrongType.status, 415);

  const oversized = await POST(request({ url: "x".repeat(5_000) }));
  assert.equal(oversized.status, 413);
});

test("nao devolve detalhes internos nem credenciais quando a consulta falha", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("falha interna contendo token=nao-expor");
  };

  try {
    const response = await POST(request({ url: calendarUrl }));
    const body = (await response.json()) as { message: string };
    assert.equal(response.status, 502);
    assert.equal(body.message, "Não foi possível validar o calendário com segurança.");
    assert.doesNotMatch(body.message, /nao-expor|token=/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("envia headers contra injecao, clickjacking e recursos desnecessarios", () => {
  const headers = new Map(securityHeaders.map(({ key, value }) => [key.toLowerCase(), value]));
  assert.match(headers.get("content-security-policy") ?? "", /default-src 'self'/);
  assert.match(headers.get("content-security-policy") ?? "", /connect-src 'self' https:\/\/campusvirtual\.ufla\.br/);
  assert.match(headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.match(headers.get("content-security-policy") ?? "", /form-action 'self' https:\/\/api\.notion\.com/);
  assert.equal(headers.get("x-frame-options"), "DENY");
  assert.equal(headers.get("x-content-type-options"), "nosniff");
  assert.equal(headers.get("referrer-policy"), "no-referrer");
  assert.equal(headers.get("cross-origin-resource-policy"), "same-origin");
  assert.match(headers.get("permissions-policy") ?? "", /camera=\(\)/);
});

test("interface nao usa armazenamento acessivel por JavaScript no navegador", async () => {
  const source = await readFile("apps/web/components/setup-wizard.tsx", "utf8");
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|document\.cookie/);
  assert.doesNotMatch(source, /console\.(log|debug|info|warn|error)/);
});

test("OAuth do Notion usa state, cookies protegidos e tokens cifrados", async () => {
  const connect = await readFile("apps/web/app/api/notion/connect/route.ts", "utf8");
  const callback = await readFile("apps/web/app/api/notion/callback/route.ts", "utf8");
  const crypto = await readFile("apps/web/lib/server/crypto.ts", "utf8");

  assert.match(connect, /httpOnly: true/);
  assert.match(connect, /sameSite: "lax"/);
  assert.match(callback, /timingSafeEqual/);
  assert.match(callback, /hashOpaqueToken\(installationToken\)/);
  assert.match(callback, /encryptSecret\(notion\.access_token/);
  assert.match(callback, /encryptSecret\(notion\.refresh_token/);
  assert.match(crypto, /aes-256-gcm/);
  assert.doesNotMatch(callback, /console\.(log|debug|info|warn|error)/);
});

test("onboarding preserva a guia e bloqueia campos ja concluidos", async () => {
  const source = await readFile("apps/web/components/setup-wizard.tsx", "utf8");

  assert.match(source, /target="_blank"/);
  assert.match(source, /rel="noopener noreferrer"/);
  assert.match(source, /disabled=\{!notionConnected \|\| calendarState === "success"\}/);
  assert.match(source, /disabled=\{calendarState !== "success" \|\| moodleState === "success"\}/);
  assert.match(source, /moodleState === "loading" \|\| moodleState === "success"/);
});

test("onboarding explica as opcoes corretas da exportacao do calendario", async () => {
  const source = await readFile("apps/web/components/setup-wizard.tsx", "utf8");

  assert.match(source, /Todos os eventos/);
  assert.match(source, /Intervalo personalizado/);
  assert.match(source, /Obter URL do calendário/);
  assert.match(source, /Não clique em “Exportar”/);
});

test("etapa final usa as rotas reais e deixa de ser um prototipo desabilitado", async () => {
  const source = await readFile("apps/web/components/setup-wizard.tsx", "utf8");

  assert.match(source, /technicalStepsReady = notionConnected/);
  assert.match(source, /\/api\/panels\/tasks/);
  assert.match(source, /\/api\/panels\/attendance/);
  assert.match(source, /\/api\/sync/);
  assert.doesNotMatch(source, /Substitui setup:|Substitui npm run/);
});

test("calendario e token do Campus sao persistidos somente cifrados", async () => {
  const calendar = await readFile("apps/web/app/api/onboarding/calendar/route.ts", "utf8");
  const moodle = await readFile("apps/web/app/api/onboarding/moodle/route.ts", "utf8");
  const installations = await readFile("apps/web/lib/server/installations.ts", "utf8");

  assert.match(calendar, /calendarUrlEncrypted: encryptSecret/);
  assert.match(moodle, /moodleTokenEncrypted: encryptSecret/);
  assert.match(installations, /calendar_url_encrypted/);
  assert.match(installations, /moodle_token_encrypted/);
  assert.doesNotMatch(moodle, /password|senha/i);
});

test("OAuth movel usa envio no navegador e oferece copia sem redirecionamento automatico", async () => {
  const connect = await readFile("apps/web/app/api/notion/connect/route.ts", "utf8");

  assert.match(connect, /<form method="get"/);
  assert.match(connect, /Continuar no navegador/);
  assert.match(connect, /navigator\.clipboard\.writeText/);
  assert.doesNotMatch(connect, /window\.location/);
});

test("rotas de acao nao devolvem mensagens internas de excecoes", async () => {
  for (const route of [
    "apps/web/app/api/panels/tasks/route.ts",
    "apps/web/app/api/panels/attendance/route.ts",
    "apps/web/app/api/sync/route.ts",
  ]) {
    const source = await readFile(route, "utf8");
    assert.doesNotMatch(source, /error instanceof Error \? error\.message/);
    assert.match(source, /error instanceof WebRequestError/);
  }
});

test("deploy da Vercel usa a saida do Next em vez de uma pasta publica", async () => {
  const appConfig = JSON.parse(await readFile("apps/web/vercel.json", "utf8")) as {
    framework?: string;
    outputDirectory?: string;
  };
  const rootConfig = JSON.parse(await readFile("vercel.json", "utf8")) as {
    buildCommand?: string;
    framework?: string;
    outputDirectory?: string;
  };

  assert.equal(appConfig.framework, "nextjs");
  assert.equal(appConfig.outputDirectory, ".next");
  assert.equal(rootConfig.framework, "nextjs");
  assert.equal(rootConfig.buildCommand, "npm run web:build");
  assert.equal(rootConfig.outputDirectory, "apps/web/.next");
});
