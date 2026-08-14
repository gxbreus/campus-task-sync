import { NextResponse } from "next/server";

const CAMPUS_HOST = "campusvirtual.ufla.br";
const CAMPUS_CALENDAR_PATH = "/presencial/calendar/export_execute.php";
const MAX_REQUEST_BYTES = 4_096;
const MAX_CALENDAR_BYTES = 2_000_000;
const RESPONSE_HEADERS = { "cache-control": "no-store, max-age=0" };

class RequestError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function calendarUrl(value: unknown): URL {
  if (typeof value !== "string" || !value.trim()) throw new RequestError("Cole a URL do calendário.");

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new RequestError("A URL do calendário não é válida.");
  }

  if (
    url.protocol !== "https:" ||
    url.hostname !== CAMPUS_HOST ||
    url.port ||
    url.username ||
    url.password ||
    url.pathname !== CAMPUS_CALENDAR_PATH
  ) {
    throw new RequestError("Use somente a URL dinâmica do calendário oficial da UFLA.");
  }
  return url;
}

async function requestBody(request: Request): Promise<{ url?: unknown }> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new RequestError("Envie os dados no formato JSON.", 415);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    throw new RequestError("A solicitação ultrapassou o tamanho permitido.", 413);
  }

  const contents = await request.text();
  if (new TextEncoder().encode(contents).byteLength > MAX_REQUEST_BYTES) {
    throw new RequestError("A solicitação ultrapassou o tamanho permitido.", 413);
  }

  try {
    return JSON.parse(contents) as { url?: unknown };
  } catch {
    throw new RequestError("O conteúdo enviado não é um JSON válido.");
  }
}

function validateOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).origin !== new URL(request.url).origin) {
        throw new RequestError("Origem da solicitação não autorizada.", 403);
      }
    } catch (error) {
      if (error instanceof RequestError) throw error;
      throw new RequestError("Origem da solicitação não autorizada.", 403);
    }
  }
}

export async function POST(request: Request) {
  try {
    validateOrigin(request);
    const body = await requestBody(request);
    const url = calendarUrl(body.url);
    const response = await fetch(url, {
      headers: { accept: "text/calendar, text/plain;q=0.9" },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new RequestError(`O Campus respondeu com HTTP ${response.status}.`);

    const responseLength = Number(response.headers.get("content-length") ?? 0);
    if (Number.isFinite(responseLength) && responseLength > MAX_CALENDAR_BYTES) {
      throw new RequestError("O calendário ultrapassou o tamanho permitido.", 413);
    }

    const contents = await response.text();
    if (new TextEncoder().encode(contents).byteLength > MAX_CALENDAR_BYTES) {
      throw new RequestError("O calendário ultrapassou o tamanho permitido.", 413);
    }
    if (!contents.includes("BEGIN:VCALENDAR")) {
      throw new RequestError("O endereço não retornou um calendário válido.");
    }
    const events = contents.match(/BEGIN:VEVENT/g)?.length ?? 0;
    return NextResponse.json({ valid: true, events }, { headers: RESPONSE_HEADERS });
  } catch (error) {
    const knownError = error instanceof RequestError;
    const message = knownError ? error.message : "Não foi possível validar o calendário com segurança.";
    return NextResponse.json(
      { valid: false, message },
      { status: knownError ? error.status : 502, headers: RESPONSE_HEADERS },
    );
  }
}
