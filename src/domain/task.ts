export type TaskAttachment = {
  name: string;
  mimeType?: string;
  size?: number;
  browserUrl?: string;
  apiUrl?: string;
};

export type CampusTask = {
  externalId: string;
  title: string;
  description?: string;
  course?: string;
  courseCode?: string;
  sourceUrl?: string;
  opensAt?: string;
  dueAt?: string;
  openingInformation: string;
  attachments?: TaskAttachment[];
};

export type ManagedTaskStatus = "pending" | "completed" | "cancelled";

export type ManagedTask = {
  destinationId: string;
  externalId: string;
  status: ManagedTaskStatus;
  hasSuggestedAnswer: boolean;
};

export interface TaskDestination {
  listManagedTasks(): Promise<ManagedTask[]>;
  create(task: CampusTask): Promise<void>;
  update(destinationId: string, task: CampusTask, current: ManagedTask): Promise<void>;
  cancel(destinationId: string): Promise<void>;
}
