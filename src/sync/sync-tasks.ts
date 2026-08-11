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

function statusPriority(task: ManagedTask): number {
  if (task.status === "completed") return 0;
  if (task.status === "pending") return 1;
  return 2;
}

function existingTaskFor(
  task: CampusTask,
  existing: Map<string, ManagedTask>,
): ManagedTask | undefined {
  const current = existing.get(task.externalId);
  if (current) return current;
  return (task.legacyExternalIds ?? [])
    .flatMap((externalId) => {
      const managed = existing.get(externalId);
      return managed ? [managed] : [];
    })
    .sort((left, right) => statusPriority(left) - statusPriority(right))[0];
}

export async function syncTasks(
  calendarTasks: CampusTask[],
  destination: TaskDestination,
): Promise<SyncResult> {
  const incoming = uniqueTasks(calendarTasks);
  const existing = indexedTasks(await destination.listManagedTasks());
  const result: SyncResult = { created: 0, updated: 0, cancelled: 0 };
  const matchedDestinations = new Set<string>();

  for (const [externalId, task] of incoming) {
    const managed = existingTaskFor(task, existing);
    if (!managed) {
      await destination.create(task);
      result.created += 1;
      continue;
    }

    matchedDestinations.add(managed.destinationId);
    await destination.update(managed.destinationId, task, managed);
    result.updated += 1;
  }

  for (const [externalId, managed] of existing) {
    if (
      !incoming.has(externalId) &&
      !matchedDestinations.has(managed.destinationId) &&
      managed.status !== "cancelled"
    ) {
      await destination.cancel(managed.destinationId);
      result.cancelled += 1;
    }
  }

  return result;
}
