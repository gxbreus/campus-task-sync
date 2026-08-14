import { NextResponse } from "next/server";

const CAMPUS_HOST = "campusvirtual.ufla.br";

function calendarUrl(value: unknown): URL {
  if (typeof value !== "string" || !value.trim()) throw new Error("Cole a URL do calendário.");
  const url = new URL(value.trim());
  if (
    url.protocol !== "https:" ||
    url.hostname !== CAMPUS_HOST ||
    url.port ||
    !url.pathname.includes("/calendar/")
  ) {
    throw new Error("Use somente a URL dinâmica do calendário oficial da UFLA.");
  }
  return url;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: unknown };
    const url = calendarUrl(body.url);
    const response = await fetch(url, {
      headers: { accept: "text/calendar, text/plain;q=0.9" },
      redirect: "follow",
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`O Campus respondeu com HTTP ${response.status}.`);
    const contents = await response.text();
    if (!contents.includes("BEGIN:VCALENDAR")) {
      throw new Error("O endereço não retornou um calendário válido.");
    }
    const events = contents.match(/BEGIN:VEVENT/g)?.length ?? 0;
    return NextResponse.json({ valid: true, events });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível validar o calendário.";
    return NextResponse.json({ valid: false, message }, { status: 400 });
  }
}
