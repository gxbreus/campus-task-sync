import type { ImportantDate } from "../plans/types.js";
import { notionSelectValue } from "./select-value.js";

const NOTION_API_VERSION = "2026-03-11";
const DATABASE_TITLE = "Datas Importantes";
type JsonObject = Record<string, unknown>;

type Options = {
  token: string;
  parentPageId: string;
  dates: ImportantDate[];
  travel?: { start: string; end: string };
  fetcher?: typeof fetch;
};

export type ImportantDatesResult = {
  databaseId: string;
  dataSourceId: string;
  created: boolean;
  entriesCreated: number;
  entriesUpdated: number;
};

function objectValue(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null ? (value as JsonObject) : undefined;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function richTextValue(property: unknown): string | undefined {
  const text = arrayValue(objectValue(property)?.rich_text)
    .map((item) => objectValue(item)?.plain_text)
    .filter((item): item is string => typeof item === "string")
    .join("");
  return text || undefined;
}

function overlapsTravel(date: ImportantDate, travel: NonNullable<Options["travel"]>): boolean {
  return date.start <= travel.end && (date.end ?? date.start) >= travel.start;
}

function propertiesFor(date: ImportantDate, travel: Options["travel"]): JsonObject {
  const duringTravel = travel ? overlapsTravel(date, travel) : false;
  return {
    Evento: { title: [{ text: { content: date.title } }] },
    Disciplina: { select: { name: notionSelectValue(date.courseName) } },
    Data: { date: { start: date.start, ...(date.end ? { end: date.end } : {}) } },
    Tipo: { select: { name: date.type } },
    Peso: date.weight === undefined ? { number: null } : { number: date.weight },
    Conteúdo: { rich_text: date.content ? [{ text: { content: date.content } }] : [] },
    Observações: { rich_text: date.notes ? [{ text: { content: date.notes } }] : [] },
    ...(travel ? { Viagem: { select: { name: duringTravel ? "✈️ Durante a viagem" : "Sem conflito" } } } : {}),
    Fonte: { select: { name: "Plano de ensino" } },
    "ID externo": { rich_text: [{ text: { content: date.id } }] },
  };
}

export async function setupImportantDatesPanel(options: Options): Promise<ImportantDatesResult> {
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
    if (!response.ok) {
      const details = (await response.text()).slice(0, 800);
      throw new Error(`Falha ao configurar datas importantes (HTTP ${response.status}): ${details}`);
    }
    return (await response.json()) as JsonObject;
  };

  let databaseId: string | undefined;
  let cursor: string | undefined;
  do {
    const children = await request(
      `/blocks/${options.parentPageId}/children?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    for (const value of arrayValue(children.results)) {
      const block = objectValue(value);
      if (objectValue(block?.child_database)?.title === DATABASE_TITLE && typeof block?.id === "string") {
        databaseId = block.id;
        break;
      }
    }
    cursor = typeof children.next_cursor === "string" ? children.next_cursor : undefined;
  } while (!databaseId && cursor);

  let created = false;
  if (!databaseId) {
    const courseOptions = [...new Set(options.dates.map((date) => notionSelectValue(date.courseName)))]
      .sort((left, right) => left.localeCompare(right, "pt-BR"))
      .map((name, index) => ({
        name,
        color: ["blue", "green", "orange", "purple", "pink", "yellow", "red", "brown", "gray"][index % 9],
      }));
    const database = await request("/databases", {
      method: "POST",
      body: JSON.stringify({
        parent: { type: "page_id", page_id: options.parentPageId },
        title: [{ type: "text", text: { content: DATABASE_TITLE } }],
        description: [{ type: "text", text: { content: "Provas, trabalhos e atividades previstas nos planos de ensino. Confirme alterações no Campus Virtual." } }],
        icon: { type: "emoji", emoji: "🗓️" },
        is_inline: true,
        initial_data_source: {
          title: [{ type: "text", text: { content: "Avaliações" } }],
          properties: {
            Evento: { title: {} },
            Disciplina: { select: { options: courseOptions } },
            Data: { date: {} },
            Tipo: { select: { options: [
              { name: "Prova", color: "red" },
              { name: "Trabalho", color: "purple" },
              { name: "Atividade", color: "blue" },
              { name: "Recuperação", color: "orange" },
            ] } },
            Peso: { number: { format: "number" } },
            Conteúdo: { rich_text: {} },
            Observações: { rich_text: {} },
            ...(options.travel ? {
              Viagem: { select: { options: [
                { name: "✈️ Durante a viagem", color: "red" },
                { name: "Sem conflito", color: "green" },
              ] } },
            } : {}),
            Fonte: { select: { options: [{ name: "Plano de ensino", color: "gray" }] } },
            "ID externo": { rich_text: {} },
          },
        },
      }),
    });
    if (typeof database.id !== "string") throw new Error("O Notion não retornou o ID do painel de datas.");
    databaseId = database.id;
    created = true;
  }

  const database = await request(`/databases/${databaseId}`);
  const source = objectValue(arrayValue(database.data_sources)[0]);
  if (typeof source?.id !== "string") throw new Error("O Notion não retornou a fonte de dados do painel de datas.");
  const dataSourceId = source.id;

  const existing = new Map<string, string>();
  cursor = undefined;
  do {
    const pages = await request(`/data_sources/${dataSourceId}/query`, {
      method: "POST",
      body: JSON.stringify({ ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    for (const value of arrayValue(pages.results)) {
      const page = objectValue(value);
      const properties = objectValue(page?.properties);
      const id = richTextValue(properties?.["ID externo"]);
      if (id && typeof page?.id === "string") existing.set(id, page.id);
    }
    cursor = typeof pages.next_cursor === "string" ? pages.next_cursor : undefined;
  } while (cursor);

  let entriesCreated = 0;
  let entriesUpdated = 0;
  for (const date of options.dates) {
    const pageId = existing.get(date.id);
    if (pageId) {
      await request(`/pages/${pageId}`, {
        method: "PATCH",
        body: JSON.stringify({ properties: propertiesFor(date, options.travel) }),
      });
      entriesUpdated += 1;
    } else {
      await request("/pages", {
        method: "POST",
        body: JSON.stringify({
          parent: { type: "data_source_id", data_source_id: dataSourceId },
          properties: propertiesFor(date, options.travel),
        }),
      });
      entriesCreated += 1;
    }
  }

  const details = await request(`/data_sources/${dataSourceId}`);
  const properties = objectValue(details.properties);
  const propertyId = (name: string): string | undefined => {
    const id = objectValue(properties?.[name])?.id;
    return typeof id === "string" ? decodeURIComponent(id) : undefined;
  };
  const views = await request(`/views?database_id=${encodeURIComponent(databaseId)}`);
  const existingViews: JsonObject[] = [];
  const names = new Set<string>();
  for (const value of arrayValue(views.results)) {
    let view = objectValue(value);
    if (typeof view?.name !== "string" && typeof view?.id === "string") view = await request(`/views/${view.id}`);
    if (view) existingViews.push(view);
    if (typeof view?.name === "string") names.add(view.name);
  }
  const table = existingViews.find((view) => view.type === "table");
  if (typeof table?.id === "string") {
    const columns: Array<[string, number]> = [
      ["Disciplina", 260], ["Evento", 300], ["Data", 190], ["Tipo", 120], ["Peso", 90],
      ...(options.travel ? [["Viagem", 180] as [string, number]] : []),
      ["Conteúdo", 360], ["Observações", 420],
    ];
    await request(`/views/${table.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        configuration: {
          type: "table",
          properties: [
            ...columns.flatMap(([name, width]) => {
              const id = propertyId(name);
              return id ? [{ property_id: id, visible: true, width }] : [];
            }),
            ...["Fonte", "ID externo"].flatMap((name) => {
              const id = propertyId(name);
              return id ? [{ property_id: id, visible: false }] : [];
            }),
          ],
          frozen_column_index: 0,
        },
        sorts: [{ property: "Data", direction: "ascending" }],
      }),
    });
  }
  const dateId = propertyId("Data");
  if (dateId && !names.has("Calendário de avaliações")) {
    await request("/views", {
      method: "POST",
      body: JSON.stringify({
        database_id: databaseId,
        data_source_id: dataSourceId,
        name: "Calendário de avaliações",
        type: "calendar",
        configuration: { type: "calendar", date_property_id: dateId },
        sorts: [{ property: "Data", direction: "ascending" }],
      }),
    });
  }

  return { databaseId, dataSourceId, created, entriesCreated, entriesUpdated };
}
