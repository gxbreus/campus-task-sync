import type { PlannedAbsence } from "../plans/semester-2026-2.js";

const NOTION_API_VERSION = "2026-03-11";
type JsonObject = Record<string, unknown>;

type Options = {
  token: string;
  dataSourceId: string;
  absences: PlannedAbsence[];
  fetcher?: typeof fetch;
};

function objectValue(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null ? (value as JsonObject) : undefined;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function richText(property: unknown): string {
  return arrayValue(objectValue(property)?.rich_text)
    .map((value) => objectValue(value)?.plain_text)
    .filter((value): value is string => typeof value === "string")
    .join("");
}

function numberValue(property: unknown): number {
  const value = objectValue(property)?.number;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export async function markPlannedAbsences(options: Options): Promise<number> {
  const fetcher = options.fetcher ?? fetch;
  const request = async (path: string, init: RequestInit = {}): Promise<JsonObject> => {
    const response = await fetcher(`https://api.notion.com/v1${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${options.token}`,
        "content-type": "application/json",
        "notion-version": NOTION_API_VERSION,
        ...init.headers,
      },
    });
    if (!response.ok) throw new Error(`Falha ao registrar faltas planejadas (HTTP ${response.status}): ${(await response.text()).slice(0, 800)}`);
    return (await response.json()) as JsonObject;
  };

  let source = await request(`/data_sources/${options.dataSourceId}`);
  if (!objectValue(source.properties)?.["Ausências planejadas"]) {
    await request(`/data_sources/${options.dataSourceId}`, {
      method: "PATCH",
      body: JSON.stringify({ properties: { "Ausências planejadas": { rich_text: {} } } }),
    });
    source = await request(`/data_sources/${options.dataSourceId}`);
  }
  if (!objectValue(source.properties)?.["Ausências planejadas"]) {
    throw new Error("Não foi possível criar a coluna de ausências planejadas.");
  }

  const byCode = new Map(options.absences.map((item) => [item.courseCode, item]));
  let updated = 0;
  let cursor: string | undefined;
  do {
    const pages = await request(`/data_sources/${options.dataSourceId}/query`, {
      method: "POST",
      body: JSON.stringify({ ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    for (const value of arrayValue(pages.results)) {
      const page = objectValue(value);
      const properties = objectValue(page?.properties);
      const plan = byCode.get(richText(properties?.Codigo));
      if (!plan || typeof page?.id !== "string") continue;

      const changes: JsonObject = {};
      const recordedDates = new Set(
        richText(properties?.["Ausências planejadas"])
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      );
      const newDates = plan.dates.filter((date) => !recordedDates.has(date));
      const availableCheckboxes = Object.keys(properties ?? {})
        .filter((name) => /^Falta \d+$/.test(name))
        .sort((left, right) => Number(left.slice(6)) - Number(right.slice(6)))
        .filter((name) => objectValue(properties?.[name])?.checkbox !== true);
      newDates.slice(0, availableCheckboxes.length).forEach((date, index) => {
        changes[availableCheckboxes[index]!] = { checkbox: true };
        recordedDates.add(date);
      });
      const overflow = newDates.slice(availableCheckboxes.length);
      if (overflow.length > 0) {
        changes["Faltas adicionais"] = {
          number: numberValue(properties?.["Faltas adicionais"]) + overflow.length,
        };
        overflow.forEach((date) => recordedDates.add(date));
      }
      if (newDates.length > 0) {
        changes["Ausências planejadas"] = {
          rich_text: [{ text: { content: [...recordedDates].sort().join(", ") } }],
        };
      }
      if (Object.keys(changes).length > 0) {
        await request(`/pages/${page.id}`, {
          method: "PATCH",
          body: JSON.stringify({ properties: changes }),
        });
        updated += 1;
      }
    }
    cursor = typeof pages.next_cursor === "string" ? pages.next_cursor : undefined;
  } while (cursor);
  return updated;
}
