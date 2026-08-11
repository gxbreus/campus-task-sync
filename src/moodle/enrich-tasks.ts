import type { CampusTask } from "../domain/task.js";
import type { MoodleActivity } from "./client.js";

type MoodleActivitySource = {
  getActivities(courseCodes: string[]): Promise<MoodleActivity[]>;
};

function normalized(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function attachmentDescription(activity: MoodleActivity): string | undefined {
  const links = activity.attachments.flatMap((attachment) =>
    attachment.browserUrl ? [`- ${attachment.name}: ${attachment.browserUrl}`] : [],
  );
  return [activity.description, links.length ? `Anexos:\n${links.join("\n")}` : undefined]
    .filter(Boolean)
    .join("\n\n") || undefined;
}

function closestActivity(task: CampusTask, candidates: MoodleActivity[]): MoodleActivity | undefined {
  const title = normalized(task.title);
  const exact = candidates.filter((activity) => normalized(activity.name) === title);
  const matching = exact.length
    ? exact
    : candidates.filter((activity) => {
        const name = normalized(activity.name);
        return name.includes(title) || title.includes(name);
      });
  if (matching.length <= 1 || !task.dueAt) return matching[0];
  const due = new Date(task.dueAt).getTime();
  return matching.sort((left, right) => {
    const leftDistance = left.dueAt ? Math.abs(new Date(left.dueAt).getTime() - due) : Infinity;
    const rightDistance = right.dueAt ? Math.abs(new Date(right.dueAt).getTime() - due) : Infinity;
    return leftDistance - rightDistance;
  })[0];
}

export async function enrichTasksWithMoodle(
  tasks: CampusTask[],
  client: MoodleActivitySource,
): Promise<CampusTask[]> {
  const courseCodes = [...new Set(tasks.flatMap((task) => (task.courseCode ? [task.courseCode] : [])))];
  const activities = await client.getActivities(courseCodes);
  return tasks.map((task) => {
    if (!task.courseCode) return task;
    const activity = closestActivity(
      task,
      activities.filter((candidate) => candidate.courseCode === task.courseCode),
    );
    if (!activity) return task;
    const description = attachmentDescription(activity);
    return {
      ...task,
      course: activity.courseName,
      sourceUrl: activity.url ?? task.sourceUrl,
      ...(description ? { description } : {}),
      ...(activity.opensAt ? { opensAt: activity.opensAt } : {}),
      ...(activity.dueAt ? { dueAt: activity.dueAt } : {}),
      attachments: activity.attachments,
      openingInformation: activity.opensAt
        ? "Data obtida diretamente da atividade no Campus"
        : task.openingInformation,
    };
  });
}
