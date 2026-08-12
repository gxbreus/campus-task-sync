import { readFile, writeFile } from "node:fs/promises";

import { notionSelectValue } from "./select-value.js";

const NOTION_API_VERSION = "2026-03-11";
const SETUP_MARKER = "Painel configurado automaticamente pelo Campus Task Sync.";
const COURSE_COLORS = [
  "blue",
  "green",
  "orange",
  "purple",
  "pink",
  "yellow",
  "red",
  "brown",
  "gray",
] as const;

type JsonObject = Record<string, unknown>;

type SetupNotionOptions = {
  token: string;
  parentPageUrl: string;
  courses: string[];
  existingDataSourceId?: string;
  fetcher?: typeof fetch;
  saveDataSourceId?: (dataSourceId: string) => Promise<void>;
  saveAssigneeUserId?: (userId: string) => Promise<void>;
};

export type NotionSetupResult = {
  databaseId?: string;
  dataSourceId: string;
  created: boolean;
  viewsCreated: string[];
  assigneeUserId?: string;
};

function objectValue(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null ? (value as JsonObject) : undefined;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function parseNotionPageId(value: string): string {
  const url = new URL(value);
  const slug = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? "")
    .replaceAll("-", "");
  const id = slug.match(/([0-9a-f]{32})$/i)?.[1];
  if (!id) throw new Error("Nao foi possivel identificar a pagina na URL do Notion.");
  return id;
}

export async function saveEnvDataSourceId(
  dataSourceId: string,
  envPath = ".env",
): Promise<void> {
  await saveEnvValue("NOTION_DATA_SOURCE_ID", dataSourceId, envPath);
}

async function saveEnvValue(name: string, value: string, envPath = ".env"): Promise<void> {
  const current = await readFile(envPath, "utf8");
  const line = `${name}=${value}`;
  const expression = new RegExp(`^${name}=.*$`, "m");
  const next = expression.test(current)
    ? current.replace(expression, line)
    : `${current.trimEnd()}\n${line}\n`;
  await writeFile(envPath, next, { encoding: "utf8", mode: 0o600 });
}

export async function saveEnvAssigneeUserId(
  userId: string,
  envPath = ".env",
): Promise<void> {
  await saveEnvValue("NOTION_ASSIGNEE_USER_ID", userId, envPath);
}

export async function setupNotion(
  options: SetupNotionOptions,
): Promise<NotionSetupResult> {
  const fetcher = options.fetcher ?? fetch;
  const saveDataSourceId = options.saveDataSourceId ?? saveEnvDataSourceId;
  const saveAssigneeUserId = options.saveAssigneeUserId ?? saveEnvAssigneeUserId;

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
      throw new Error(`Falha na configuracao do Notion (HTTP ${response.status}): ${details}`);
    }
    return (await response.json()) as JsonObject;
  };

  const parentPageId = parseNotionPageId(options.parentPageUrl);
  await request(`/pages/${parentPageId}`);

  let databaseId: string;
  let dataSourceId: string;
  let created = false;

  if (options.existingDataSourceId) {
    dataSourceId = options.existingDataSourceId;
    const existingDataSource = await request(`/data_sources/${dataSourceId}`);
    const parent = objectValue(existingDataSource.parent);
    if (typeof parent?.database_id !== "string") {
      throw new Error("O Notion nao retornou a base vinculada a fonte de dados.");
    }
    databaseId = parent.database_id;
  } else {
    const uniqueCourses = [
      ...new Set(options.courses.filter(Boolean).map(notionSelectValue)),
    ].sort();
    const courseOptions = uniqueCourses.map((name, index) => ({
      name,
      color: COURSE_COLORS[index % COURSE_COLORS.length],
    }));

    const database = await request("/databases", {
      method: "POST",
      body: JSON.stringify({
        parent: { type: "page_id", page_id: parentPageId },
        title: [{ type: "text", text: { content: "Pendencias do Campus" } }],
        description: [
          {
            type: "text",
            text: { content: "Atividades sincronizadas automaticamente do Campus Virtual." },
          },
        ],
        icon: { type: "emoji", emoji: "🎓" },
        is_inline: true,
        initial_data_source: {
          title: [{ type: "text", text: { content: "Tarefas" } }],
          properties: {
            Nome: { title: {} },
            Concluida: { checkbox: {} },
            Abertura: { date: {} },
            "Informação da abertura": { rich_text: {} },
            Prazo: { date: {} },
            Alerta: {
              select: {
                options: [
                  { name: "🔴 Vencida", color: "red" },
                  { name: "🔴 Fecha em 24h", color: "red" },
                  { name: "🟠 Fecha em 3 dias", color: "orange" },
                  { name: "🟡 Fecha em 7 dias", color: "yellow" },
                  { name: "🟢 No prazo", color: "green" },
                  { name: "🔵 Sem fechamento", color: "blue" },
                  { name: "✅ Concluida", color: "green" },
                ],
              },
            },
            Responsavel: { people: {} },
            Disciplina: { select: { options: courseOptions } },
            Descricao: { rich_text: {} },
            "Sugestão de resposta": { rich_text: {} },
            Link: { url: {} },
            "ID externo": { rich_text: {} },
            Origem: {
              select: { options: [{ name: "Campus Virtual", color: "blue" }] },
            },
            Situacao: {
              select: {
                options: [
                  { name: "Pendente", color: "yellow" },
                  { name: "Cancelada", color: "red" },
                ],
              },
            },
            "Sincronizado em": { date: {} },
          },
        },
      }),
    });

    if (typeof database.id !== "string") {
      throw new Error("O Notion nao retornou o ID da base criada.");
    }
    databaseId = database.id;

    const databaseDetails = await request(`/databases/${databaseId}`);
    const dataSource = objectValue(arrayValue(databaseDetails.data_sources)[0]);
    if (typeof dataSource?.id !== "string") {
      throw new Error("O Notion nao retornou o ID da fonte de dados.");
    }
    dataSourceId = dataSource.id;
    created = true;
    await saveDataSourceId(dataSourceId);

    await request(`/pages/${parentPageId}`, {
      method: "PATCH",
      body: JSON.stringify({ icon: { type: "emoji", emoji: "🎓" } }),
    });

    await request(`/blocks/${parentPageId}/children`, {
      method: "PATCH",
      body: JSON.stringify({
        position: { type: "start" },
        children: [
          {
            object: "block",
            type: "callout",
            callout: {
              icon: { type: "emoji", emoji: "✅" },
              color: "blue_background",
              rich_text: [{ type: "text", text: { content: SETUP_MARKER } }],
            },
          },
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [
                {
                  type: "text",
                  text: {
                    content:
                      "Marque Concluida quando terminar uma atividade. As cores identificam as disciplinas e o prazo continua sendo atualizado pelo Campus Virtual.",
                  },
                },
              ],
            },
          },
          { object: "block", type: "divider", divider: {} },
        ],
      }),
    });
  }

  let dataSourceDetails = await request(`/data_sources/${dataSourceId}`);
  let properties = objectValue(dataSourceDetails.properties);
  const renamedProperties: JsonObject = {};
  if (properties?.["Informacao da abertura"] && !properties?.["Informação da abertura"]) {
    renamedProperties["Informacao da abertura"] = { name: "Informação da abertura" };
  }
  if (properties?.["Sugestao de resposta"] && !properties?.["Sugestão de resposta"]) {
    renamedProperties["Sugestao de resposta"] = { name: "Sugestão de resposta" };
  }
  if (Object.keys(renamedProperties).length > 0) {
    await request(`/data_sources/${dataSourceId}`, {
      method: "PATCH",
      body: JSON.stringify({ properties: renamedProperties }),
    });
    dataSourceDetails = await request(`/data_sources/${dataSourceId}`);
    properties = objectValue(dataSourceDetails.properties);
  }
  const missingProperties: JsonObject = {};
  if (!properties?.Abertura) missingProperties.Abertura = { date: {} };
  if (!properties?.["Informação da abertura"]) {
    missingProperties["Informação da abertura"] = { rich_text: {} };
  }
  if (!properties?.["Sugestão de resposta"]) {
    missingProperties["Sugestão de resposta"] = { rich_text: {} };
  }
  if (!properties?.Responsavel) missingProperties.Responsavel = { people: {} };
  if (!properties?.Alerta) {
    missingProperties.Alerta = {
      select: {
        options: [
          { name: "🔴 Vencida", color: "red" },
          { name: "🔴 Fecha em 24h", color: "red" },
          { name: "🟠 Fecha em 3 dias", color: "orange" },
          { name: "🟡 Fecha em 7 dias", color: "yellow" },
          { name: "🟢 No prazo", color: "green" },
          { name: "🔵 Sem fechamento", color: "blue" },
          { name: "✅ Concluida", color: "green" },
        ],
      },
    };
  }
  if (Object.keys(missingProperties).length > 0) {
    await request(`/data_sources/${dataSourceId}`, {
      method: "PATCH",
      body: JSON.stringify({ properties: missingProperties }),
    });
    dataSourceDetails = await request(`/data_sources/${dataSourceId}`);
    properties = objectValue(dataSourceDetails.properties);
  }
  const disciplineId = objectValue(properties?.Disciplina)?.id;
  const deadlineId = objectValue(properties?.Prazo)?.id;
  const viewsCreated: string[] = [];

  const viewList = await request(`/views?database_id=${encodeURIComponent(databaseId)}`);
  const existingViewNames = new Set<string>();
  const existingViews: JsonObject[] = [];
  for (const item of arrayValue(viewList.results)) {
    const listedView = objectValue(item);
    if (typeof listedView?.name === "string") {
      existingViewNames.add(listedView.name);
      existingViews.push(listedView);
    } else if (typeof listedView?.id === "string") {
      const view = await request(`/views/${listedView.id}`);
      if (typeof view.name === "string") existingViewNames.add(view.name);
      existingViews.push(view);
    }
  }

  const propertyId = (name: string): string | undefined => {
    const id = objectValue(properties?.[name])?.id;
    return typeof id === "string" ? decodeURIComponent(id) : undefined;
  };
  const tableView = existingViews.find((view) => view.type === "table");
  if (typeof tableView?.id === "string") {
    const visibleColumns = [
      ["Disciplina", 220],
      ["Nome", 360],
      ["Abertura", 170],
      ["Informação da abertura", 260],
      ["Prazo", 170],
      ["Alerta", 190],
      ["Concluida", 120],
      ["Link", 140],
      ["Descricao", 380],
      ["Sugestão de resposta", 500],
    ] as const;
    const hiddenColumns = ["Responsavel", "ID externo", "Origem", "Sincronizado em", "Situacao"];
    await request(`/views/${tableView.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        configuration: {
          type: "table",
          properties: [
            ...visibleColumns.flatMap(([name, width]) => {
              const id = propertyId(name);
              return id ? [{ property_id: id, visible: true, width }] : [];
            }),
            ...hiddenColumns.flatMap((name) => {
              const id = propertyId(name);
              return id ? [{ property_id: id, visible: false }] : [];
            }),
          ],
          frozen_column_index: 0,
        },
      }),
    });
  }

  const createView = async (
    name: string,
    type: "board" | "calendar" | "list",
    extra: JsonObject = {},
  ) => {
    if (existingViewNames.has(name)) return;
    await request("/views", {
      method: "POST",
      body: JSON.stringify({
        database_id: databaseId,
        data_source_id: dataSourceId,
        name,
        type,
        ...extra,
      }),
    });
    viewsCreated.push(name);
  };

  if (typeof disciplineId === "string") {
    const boardConfiguration = {
      configuration: {
        type: "board",
        group_by: {
          type: "select",
          property_id: disciplineId,
          sort: { type: "manual" },
          hide_empty_groups: true,
        },
        card_layout: "compact",
      },
      filter: {
        and: [
          { property: "Concluida", checkbox: { equals: false } },
          { property: "Situacao", select: { does_not_equal: "Cancelada" } },
        ],
      },
      sorts: [{ property: "Prazo", direction: "ascending" }],
    };
    const existingBoard = existingViews.find((view) => view.name === "Por disciplina");
    if (typeof existingBoard?.id === "string") {
      await request(`/views/${existingBoard.id}`, {
        method: "PATCH",
        body: JSON.stringify(boardConfiguration),
      });
    } else {
      await createView("Por disciplina", "board", boardConfiguration);
    }
  }
  if (typeof deadlineId === "string") {
    await createView("Calendario", "calendar", {
      configuration: { type: "calendar", date_property_id: deadlineId },
      sorts: [{ property: "Prazo", direction: "ascending" }],
    });
  }
  await createView("Pendentes", "list", {
    filter: {
      and: [
        { property: "Concluida", checkbox: { equals: false } },
        { property: "Situacao", select: { does_not_equal: "Cancelada" } },
      ],
    },
    sorts: [{ property: "Prazo", direction: "ascending" }],
  });
  await createView("Arquivadas", "list", {
    filter: { property: "Concluida", checkbox: { equals: true } },
    sorts: [{ property: "Prazo", direction: "descending" }],
  });

  const users = await request("/users?page_size=100");
  const people = arrayValue(users.results)
    .map(objectValue)
    .filter((user): user is JsonObject => user?.type === "person" && typeof user.id === "string");
  const assigneeUserId = people.length === 1 ? (people[0]?.id as string) : undefined;
  if (assigneeUserId) await saveAssigneeUserId(assigneeUserId);

  return { databaseId, dataSourceId, created, viewsCreated, assigneeUserId };
}
