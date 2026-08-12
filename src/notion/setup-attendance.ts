const NOTION_API_VERSION = "2026-03-11";
const DATABASE_TITLE = "Controle de Faltas";
const ABSENCE_LIMIT = 8;

type JsonObject = Record<string, unknown>;

export type AttendanceCourse = { code: string; name: string };

type SetupAttendanceOptions = {
  token: string;
  parentPageId: string;
  courses: AttendanceCourse[];
  fetcher?: typeof fetch;
};

export type SetupAttendanceResult = {
  databaseId: string;
  dataSourceId: string;
  created: boolean;
  coursesCreated: number;
};

function objectValue(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null ? (value as JsonObject) : undefined;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function titleValue(property: unknown): string | undefined {
  const value = arrayValue(objectValue(property)?.title)
    .map((item) => objectValue(item)?.plain_text)
    .filter((item): item is string => typeof item === "string")
    .join("");
  return value || undefined;
}

function formulaTotal(): string {
  return Array.from(
    { length: ABSENCE_LIMIT },
    (_, index) => `toNumber(prop("Falta ${index + 1}"))`,
  ).join(" + ");
}

function attendanceProperties(): JsonObject {
  return {
    Disciplina: { title: {} },
    ...Object.fromEntries(
      Array.from({ length: ABSENCE_LIMIT }, (_, index) => [
        `Falta ${index + 1}`,
        { checkbox: {} },
      ]),
    ),
    Faltas: { formula: { expression: formulaTotal() } },
    Restantes: { formula: { expression: `${ABSENCE_LIMIT} - prop("Faltas")` } },
    Status: {
      formula: {
        expression:
          'if(prop("Faltas") >= 8, "🔴 Limite atingido", if(prop("Faltas") >= 6, "🟠 Atenção", "🟢 Dentro do limite"))',
      },
    },
    "Ausências planejadas": { rich_text: {} },
    Codigo: { rich_text: {} },
  };
}

export async function setupAttendancePanel(
  options: SetupAttendanceOptions,
): Promise<SetupAttendanceResult> {
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
      throw new Error(`Falha ao configurar controle de faltas (HTTP ${response.status}): ${details}`);
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
      if (
        objectValue(block?.child_database)?.title === DATABASE_TITLE &&
        typeof block?.id === "string"
      ) {
        databaseId = block.id;
        break;
      }
    }
    cursor = typeof children.next_cursor === "string" ? children.next_cursor : undefined;
  } while (!databaseId && cursor);

  let created = false;
  if (!databaseId) {
    const database = await request("/databases", {
      method: "POST",
      body: JSON.stringify({
        parent: { type: "page_id", page_id: options.parentPageId },
        title: [{ type: "text", text: { content: DATABASE_TITLE } }],
        description: [
          {
            type: "text",
            text: {
              content:
                "Marque um quadrado a cada dia de falta. O limite configurado é de 8 dias por disciplina.",
            },
          },
        ],
        icon: { type: "emoji", emoji: "📅" },
        is_inline: true,
        initial_data_source: {
          title: [{ type: "text", text: { content: "Faltas por disciplina" } }],
          properties: attendanceProperties(),
        },
      }),
    });
    if (typeof database.id !== "string") {
      throw new Error("O Notion nao retornou o ID do controle de faltas.");
    }
    databaseId = database.id;
    created = true;
  }

  const database = await request(`/databases/${databaseId}`);
  const source = objectValue(arrayValue(database.data_sources)[0]);
  if (typeof source?.id !== "string") {
    throw new Error("O Notion nao retornou a fonte de dados do controle de faltas.");
  }
  const dataSourceId = source.id;

  const sourceDetails = await request(`/data_sources/${dataSourceId}`);
  if (!objectValue(sourceDetails.properties)?.["Ausências planejadas"]) {
    await request(`/data_sources/${dataSourceId}`, {
      method: "PATCH",
      body: JSON.stringify({ properties: { "Ausências planejadas": { rich_text: {} } } }),
    });
  }

  const existingCourses = new Set<string>();
  cursor = undefined;
  do {
    const pages = await request(`/data_sources/${dataSourceId}/query`, {
      method: "POST",
      body: JSON.stringify({ ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    for (const value of arrayValue(pages.results)) {
      const properties = objectValue(objectValue(value)?.properties);
      const name = titleValue(properties?.Disciplina);
      if (name) existingCourses.add(name);
    }
    cursor = typeof pages.next_cursor === "string" ? pages.next_cursor : undefined;
  } while (cursor);

  let coursesCreated = 0;
  for (const course of options.courses) {
    if (existingCourses.has(course.name)) continue;
    await request("/pages", {
      method: "POST",
      body: JSON.stringify({
        parent: { type: "data_source_id", data_source_id: dataSourceId },
        properties: {
          Disciplina: { title: [{ text: { content: course.name } }] },
          Codigo: { rich_text: [{ text: { content: course.code } }] },
          ...Object.fromEntries(
            Array.from({ length: ABSENCE_LIMIT }, (_, index) => [
              `Falta ${index + 1}`,
              { checkbox: false },
            ]),
          ),
        },
      }),
    });
    coursesCreated += 1;
  }

  const views = await request(`/views?database_id=${encodeURIComponent(databaseId)}`);
  let table = arrayValue(views.results).map(objectValue).find((view) => view?.type === "table");
  if (!table) {
    const listed = arrayValue(views.results).map(objectValue).find((view) => typeof view?.id === "string");
    if (typeof listed?.id === "string") table = await request(`/views/${listed.id}`);
  }
  if (typeof table?.id === "string") {
    const currentSourceDetails = await request(`/data_sources/${dataSourceId}`);
    const properties = objectValue(currentSourceDetails.properties);
    const propertyId = (name: string): string | undefined => {
      const id = objectValue(properties?.[name])?.id;
      return typeof id === "string" ? decodeURIComponent(id) : undefined;
    };
    const columns: Array<[string, number]> = [
      ["Disciplina", 300],
      ...Array.from({ length: ABSENCE_LIMIT }, (_, index) => [
        `Falta ${index + 1}`,
        80,
      ] as [string, number]),
      ["Faltas", 90],
      ["Restantes", 100],
      ["Status", 180],
      ["Ausências planejadas", 340],
    ];
    const codeId = propertyId("Codigo");
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
            ...(codeId ? [{ property_id: codeId, visible: false }] : []),
          ],
          frozen_column_index: 0,
        },
        sorts: [{ property: "Disciplina", direction: "ascending" }],
      }),
    });
  }

  return { databaseId, dataSourceId, created, coursesCreated };
}
