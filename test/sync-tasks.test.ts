import assert from "node:assert/strict";
import test from "node:test";

import type {
  CampusTask,
  ManagedTask,
  TaskDestination,
} from "../src/domain/task.js";
import { syncTasks } from "../src/sync/sync-tasks.js";

class FakeDestination implements TaskDestination {
  readonly calls: string[] = [];

  constructor(private readonly existing: ManagedTask[]) {}

  async listManagedTasks(): Promise<ManagedTask[]> {
    return this.existing;
  }

  async create(task: CampusTask): Promise<void> {
    this.calls.push(`create:${task.externalId}`);
  }

  async update(
    destinationId: string,
    task: CampusTask,
    _current: ManagedTask,
  ): Promise<void> {
    this.calls.push(`update:${destinationId}:${task.externalId}`);
  }

  async cancel(destinationId: string): Promise<void> {
    this.calls.push(`cancel:${destinationId}`);
  }
}

const task = (externalId: string): CampusTask => ({
  externalId,
  title: externalId,
  dueAt: "2026-08-20T23:59:00.000Z",
  openingInformation: "Data não informada pelo calendário do Campus",
});

test("cria, atualiza e cancela tarefas de forma idempotente", async () => {
  const destination = new FakeDestination([
    { destinationId: "page-b", externalId: "b", status: "completed", hasSuggestedAnswer: true },
    { destinationId: "page-c", externalId: "c", status: "pending", hasSuggestedAnswer: false },
    { destinationId: "page-d", externalId: "d", status: "cancelled", hasSuggestedAnswer: false },
  ]);

  const result = await syncTasks([task("a"), task("b")], destination);

  assert.deepEqual(result, { created: 1, updated: 1, cancelled: 1 });
  assert.deepEqual(destination.calls, ["create:a", "update:page-b:b", "cancel:page-c"]);
});

test("reaproveita uma fase existente e remove somente a duplicata", async () => {
  const destination = new FakeDestination([
    {
      destinationId: "page-opening",
      externalId: "opening-event",
      status: "completed",
      hasSuggestedAnswer: false,
    },
    {
      destinationId: "page-closing",
      externalId: "closing-event",
      status: "pending",
      hasSuggestedAnswer: false,
    },
  ]);
  const grouped = {
    ...task("campus-group-1"),
    legacyExternalIds: ["opening-event", "closing-event"],
  };

  const result = await syncTasks([grouped], destination);

  assert.deepEqual(result, { created: 0, updated: 1, cancelled: 1 });
  assert.deepEqual(destination.calls, [
    "update:page-opening:campus-group-1",
    "cancel:page-closing",
  ]);
});
