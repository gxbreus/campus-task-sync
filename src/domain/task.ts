export type CampusTask = {
  externalId: string;
  title: string;
  description?: string;
  course?: string;
  sourceUrl?: string;
  opensAt?: string;
  dueAt?: string;
};

export type ManagedTaskStatus = "pending" | "completed" | "cancelled";

export type ManagedTask = {
  destinationId: string;
  externalId: string;
  status: ManagedTaskStatus;
};

export interface TaskDestination {
  listManagedTasks(): Promise<ManagedTask[]>;
  create(task: CampusTask): Promise<void>;
  update(destinationId: string, task: CampusTask, currentStatus: ManagedTaskStatus): Promise<void>;
  cancel(destinationId: string): Promise<void>;
}
