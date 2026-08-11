import type {
  CampusTask,
  ManagedTask,
  ManagedTaskStatus,
  TaskDestination,
} from "../domain/task.js";

const NOTION_API_VERSION = "2026-03-11";
const SOURCE_NAME = "Campus Virtual";

type NotionDestinationOptions = {
  token: string;
  dataSourceId: string;
  fetcher?: typeof fetch;
  now?: () => Date;
};

type JsonObject = Record<string, unknown>;

function objectValue(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null ? (value as JsonObject) : undefined;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function propertyText(property: unknown): string | undefined {
  const object = objectValue(property);
  const richText = arrayValue(object?.rich_text);
  const first = objectValue(richText[0]);
  return typeof first?.plain_text === "string" ? first.plain_text : undefined;
}

function propertySelect(property: unknown): string | undefined {
  const select = objectValue(objectValue(property)?.select);
  return typeof select?.name === "string" ? select.name : undefined;
}

function statusFromNotion(value?: string): ManagedTaskStatus {
  if (value === "Concluida") return "completed";
  if (value === "Cancelada") return "cancelled";
  return "pending";
}

function taskProperties(task: CampusTask, syncedAt: string): JsonObject {
  return {
    Nome: { title: [{ text: { content: task.title } }] },
    Prazo: {
      date: {
        start: task.startsAt,
        ...(task.endsAt ? { end: task.endsAt } : {}),
      },
    },
    Disciplina: {
      rich_text: task.course ? [{ text: { content: task.course } }] : [],
    },
    Descricao: {
      rich_text: task.description ? [{ text: { content: task.description.slice(0, 2000) } }] : [],
    },
    Link: { url: task.sourceUrl ?? null },
    "ID externo": { rich_text: [{ text: { content: task.externalId } }] },
    Origem: { select: { name: SOURCE_NAME } },
    "Sincronizado em": { date: { start: syncedAt } },
  };
}

export class NotionDestination implements TaskDestination {
  private readonly fetcher: typeof fetch;
  private readonly now: () => Date;

  constructor(private readonly options: NotionDestinationOptions) {
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  private async request(path: string, init: RequestInit): Promise<JsonObject> {
    const response = await this.fetcher(`https://api.notion.com/v1${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.options.token}`,
        "content-type": "application/json",
        "notion-version": NOTION_API_VERSION,
        ...init.headers,
      },
    });

    if (!response.ok) {
      const details = (await response.text()).slice(0, 500);
      throw new Error(`Falha na API do Notion (HTTP ${response.status}): ${details}`);
    }

    return (await response.json()) as JsonObject;
  }

  async listManagedTasks(): Promise<ManagedTask[]> {
    const tasks: ManagedTask[] = [];
    let cursor: string | undefined;

    do {
      const body = await this.request(`/data_sources/${this.options.dataSourceId}/query`, {
        method: "POST",
        body: JSON.stringify({
          filter: { property: "Origem", select: { equals: SOURCE_NAME } },
          ...(cursor ? { start_cursor: cursor } : {}),
        }),
      });

      for (const result of arrayValue(body.results)) {
        const page = objectValue(result);
        const properties = objectValue(page?.properties);
        const destinationId = typeof page?.id === "string" ? page.id : undefined;
        const externalId = propertyText(properties?.["ID externo"]);

        if (destinationId && externalId) {
          tasks.push({
            destinationId,
            externalId,
            status: statusFromNotion(propertySelect(properties?.Situacao)),
          });
        }
      }

      cursor = typeof body.next_cursor === "string" ? body.next_cursor : undefined;
    } while (cursor);

    return tasks;
  }

  async create(task: CampusTask): Promise<void> {
    await this.request("/pages", {
      method: "POST",
      body: JSON.stringify({
        parent: { type: "data_source_id", data_source_id: this.options.dataSourceId },
        properties: {
          ...taskProperties(task, this.now().toISOString()),
          Situacao: { select: { name: "Pendente" } },
        },
      }),
    });
  }

  async update(
    destinationId: string,
    task: CampusTask,
    currentStatus: ManagedTaskStatus,
  ): Promise<void> {
    await this.request(`/pages/${destinationId}`, {
      method: "PATCH",
      body: JSON.stringify({
        properties: {
          ...taskProperties(task, this.now().toISOString()),
          ...(currentStatus === "cancelled"
            ? { Situacao: { select: { name: "Pendente" } } }
            : {}),
        },
      }),
    });
  }

  async cancel(destinationId: string): Promise<void> {
    await this.request(`/pages/${destinationId}`, {
      method: "PATCH",
      body: JSON.stringify({
        properties: {
          Situacao: { select: { name: "Cancelada" } },
          "Sincronizado em": { date: { start: this.now().toISOString() } },
        },
      }),
    });
  }
}
