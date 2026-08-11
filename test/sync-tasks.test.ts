import assert from "node:assert/strict";
import test from "node:test";

import type {
  CampusTask,
  ManagedTask,
  ManagedTaskStatus,
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
    _currentStatus: ManagedTaskStatus,
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
  startsAt: "2026-08-20T23:59:00.000Z",
});

test("cria, atualiza e cancela tarefas de forma idempotente", async () => {
  const destination = new FakeDestination([
    { destinationId: "page-b", externalId: "b", status: "completed" },
    { destinationId: "page-c", externalId: "c", status: "pending" },
    { destinationId: "page-d", externalId: "d", status: "cancelled" },
  ]);

  const result = await syncTasks([task("a"), task("b")], destination);

  assert.deepEqual(result, { created: 1, updated: 1, cancelled: 1 });
  assert.deepEqual(destination.calls, ["create:a", "update:page-b:b", "cancel:page-c"]);
});
