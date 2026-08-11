import type { CampusTask, ManagedTask, TaskDestination } from "../domain/task.js";

export type SyncResult = {
  created: number;
  updated: number;
  cancelled: number;
};

function uniqueTasks(tasks: CampusTask[]): Map<string, CampusTask> {
  const unique = new Map<string, CampusTask>();
  for (const task of tasks) unique.set(task.externalId, task);
  return unique;
}

function indexedTasks(tasks: ManagedTask[]): Map<string, ManagedTask> {
  return new Map(tasks.map((task) => [task.externalId, task]));
}

export async function syncTasks(
  calendarTasks: CampusTask[],
  destination: TaskDestination,
): Promise<SyncResult> {
  const incoming = uniqueTasks(calendarTasks);
  const existing = indexedTasks(await destination.listManagedTasks());
  const result: SyncResult = { created: 0, updated: 0, cancelled: 0 };

  for (const [externalId, task] of incoming) {
    const managed = existing.get(externalId);
    if (!managed) {
      await destination.create(task);
      result.created += 1;
      continue;
    }

    await destination.update(managed.destinationId, task, managed.status);
    result.updated += 1;
  }

  for (const [externalId, managed] of existing) {
    if (!incoming.has(externalId) && managed.status !== "cancelled") {
      await destination.cancel(managed.destinationId);
      result.cancelled += 1;
    }
  }

  return result;
}
