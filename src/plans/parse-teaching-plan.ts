import type { ImportantDate } from "./types.js";

type CourseFallback = { code: string; name: string; period: string };

function normalized(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function isoDate(value: string): string {
  const [day, month, year] = value.split("/");
  return `${year}-${month}-${day}`;
}

function slug(value: string): string {
  return normalized(value).replaceAll(" ", "-").slice(0, 72);
}

function eventType(title: string): ImportantDate["type"] {
  const value = normalized(title);
  if (/recupera|segunda chamada|adicional/.test(value)) return "Recuperação";
  if (/prova|avaliacao/.test(value)) return "Prova";
  if (/projeto|trabalho|seminario|entrega|prog/.test(value)) return "Trabalho";
  return "Atividade";
}

function cleanTitle(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s*[.;:,]+\s*$/, "")
    .trim();
}

function eventTitles(description: string): string[] {
  const result: string[] = [];
  for (const match of description.matchAll(/\[\s*entrega\s*:\s*([^\]]+)\]/giu)) {
    result.push(`Entrega — ${cleanTitle(match[1] ?? "")}`);
  }
  const withoutDeliveries = description.replace(/\[[^\]]+\]/g, " ");
  const patterns = [
    /atividade\s+avaliativa\s*#?\s*\d+/giu,
    /prova\s+(?:de\s+)?segunda\s+chamada/giu,
    /prova\s+(?:de\s+)?recupera[çc][aã]o/giu,
    /prova\s*#?\s*\d+/giu,
    /avalia[çc][aã]o\s+(?:de\s+)?recupera[çc][aã]o/giu,
    /avalia[çc][aã]o\s+adicional/giu,
    /projeto\s*#?\s*\d+\s*(?:\([^)]*\)|[-–—:]?\s*[^.;\[]+)?/giu,
    /apresenta[çc][aã]o\s+do\s+trabalho\s+pr[áa]tico/giu,
    /semin[áa]rio(?:s)?(?:\s+em\s+v[íi]deo)?/giu,
  ];
  for (const pattern of patterns) {
    for (const match of withoutDeliveries.matchAll(pattern)) {
      result.push(cleanTitle(match[0]));
    }
  }
  return [...new Map(result.filter(Boolean).map((title) => [normalized(title), title])).values()];
}

function assessmentWeights(text: string): Array<{ name: string; weight: number }> {
  const block = text.match(/Atividades Avaliativas:\s*([\s\S]*?)\nDados da Ementa/i)?.[1] ?? "";
  return [...block.replace(/\s*\n\s*/g, " ").matchAll(/([^;:]+):\s*(\d+(?:[.,]\d+)?)\s*%/g)]
    .map((match) => ({
      name: normalized(match[1] ?? ""),
      weight: Number((match[2] ?? "0").replace(",", ".")),
    }))
    .filter((item) => Boolean(item.name));
}

function weightFor(title: string, weights: Array<{ name: string; weight: number }>): number | undefined {
  const value = normalized(title)
    .replace(/entrega /g, "")
    .replace(/^prova\s*/g, "p")
    .replace(/projeto /g, "projeto ")
    .replaceAll(" ", "");
  const candidate = weights.find((item) => {
    const name = item.name
      .replace(/^prova\s*/g, "p")
      .replaceAll(" ", "");
    return name.includes(value) || value.includes(name);
  });
  return candidate?.weight;
}

export function parseTeachingPlanText(text: string, fallback: CourseFallback): ImportantDate[] {
  if (!/PLANO DE ENSINO/i.test(text) || !/Cronograma de Atividades/i.test(text)) return [];
  const course = text.match(/C[oó]digo:\s*([^\s]+)\s+Nome:\s*([^\n]+)/i);
  const period = text.match(/Semestre:\s*(\d{4}\/\d)/i)?.[1] ?? fallback.period;
  const courseCode = course?.[1]?.trim().toUpperCase() ?? fallback.code;
  const courseName = course?.[2]?.trim() ?? fallback.name;
  const lines = text.slice(text.search(/Cronograma de Atividades/i)).split(/\r?\n/);
  const rows: Array<{ date: string; description: string }> = [];
  for (const line of lines) {
    const row = line.match(/^\s*\d+\s+(\d{2}\/\d{2}\/\d{4})\s+(.+)$/);
    if (row?.[1] && row[2]) {
      rows.push({ date: isoDate(row[1]), description: cleanTitle(row[2]) });
    } else if (rows.length > 0 && /^\s{8,}\S/.test(line)) {
      rows.at(-1)!.description = cleanTitle(`${rows.at(-1)!.description} ${line.trim()}`);
    }
  }
  const weights = assessmentWeights(text);
  const dates = new Map<string, ImportantDate>();
  for (const row of rows) {
    for (const title of eventTitles(row.description)) {
      const key = `${courseCode}:${normalized(title)}`;
      const existing = dates.get(key);
      if (existing) {
        if (row.date > existing.start) existing.end = row.date;
        continue;
      }
      const weight = weightFor(title, weights);
      dates.set(key, {
        id: `${period.replace("/", "-")}:${courseCode}:plano:${slug(title)}`,
        courseCode,
        courseName,
        title,
        type: eventType(title),
        start: row.date,
        ...(weight === undefined ? {} : { weight }),
        content: row.description,
        notes: "Data extraída automaticamente do plano de ensino publicado no Campus Virtual.",
      });
    }
  }
  return [...dates.values()].sort((left, right) => left.start.localeCompare(right.start));
}
