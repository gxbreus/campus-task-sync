import { createHash } from "node:crypto";

import ICAL from "ical.js";

import type { CampusTask } from "../domain/task.js";

type EventPhase = "opening" | "closing" | "single";

type CalendarEvent = Omit<CampusTask, "externalId" | "opensAt" | "dueAt"> & {
  externalId: string;
  occurredAt: string;
  phase: EventPhase;
  baseTitle: string;
};

function cleanText(value: string | null | undefined): string | undefined {
  const cleaned = value?.replace(/\\n/g, "\n").trim();
  return cleaned || undefined;
}

function eventUrl(component: ICAL.Component, description?: string): string | undefined {
  const rawUrl = component.getFirstPropertyValue("url");
  const explicitUrl = typeof rawUrl === "string" ? cleanText(rawUrl) : undefined;
  if (explicitUrl) return explicitUrl;

  return description?.match(/https?:\/\/[^\s<>"']+/)?.[0];
}

function courseName(component: ICAL.Component): string | undefined {
  const categories = component.getFirstPropertyValue("categories");
  const value = Array.isArray(categories)
    ? cleanText(categories.join(", "))
    : typeof categories === "string"
      ? cleanText(categories)
      : undefined;
  const courseCode = value?.match(/^([A-Z]{2,}\d{3})/i)?.[1];
  return courseCode?.toUpperCase() ?? value;
}

function eventPhase(title: string): { phase: EventPhase; baseTitle: string } {
  const suffix = title.match(/\s*\(([^()]*)\)\s*$/);
  if (!suffix) return { phase: "single", baseTitle: title };

  const description = suffix[1]?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const baseTitle = title.slice(0, suffix.index).trim();
  if (description?.match(/\b(abertura|inicio)\b/)) {
    return { phase: "opening", baseTitle };
  }
  if (description?.match(/\b(encerramento|fechamento|termino)\b/)) {
    return { phase: "closing", baseTitle };
  }
  return { phase: "single", baseTitle: title };
}

function groupedExternalId(event: CalendarEvent): string {
  const identity = `${event.course ?? ""}\n${event.baseTitle.toLocaleLowerCase("pt-BR")}`;
  return `campus-group-${createHash("sha256").update(identity).digest("hex").slice(0, 32)}`;
}

function consolidateEvents(events: CalendarEvent[]): CampusTask[] {
  const tasks: CampusTask[] = [];
  const phased = new Map<string, CalendarEvent[]>();

  for (const event of events) {
    if (event.phase === "single") {
      tasks.push({
        externalId: event.externalId,
        title: event.title,
        description: event.description,
        course: event.course,
        sourceUrl: event.sourceUrl,
        dueAt: event.occurredAt,
      });
      continue;
    }

    const id = groupedExternalId(event);
    phased.set(id, [...(phased.get(id) ?? []), event]);
  }

  for (const [externalId, group] of phased) {
    const opening = group
      .filter((event) => event.phase === "opening")
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))[0];
    const closing = group
      .filter((event) => event.phase === "closing")
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))[0];
    const reference = closing ?? opening;
    if (!reference) continue;

    tasks.push({
      externalId,
      title: reference.baseTitle,
      description: closing?.description ?? opening?.description,
      course: reference.course,
      sourceUrl: closing?.sourceUrl ?? opening?.sourceUrl,
      ...(opening ? { opensAt: opening.occurredAt } : {}),
      ...(closing ? { dueAt: closing.occurredAt } : {}),
    });
  }

  return tasks.sort((left, right) =>
    (left.dueAt ?? left.opensAt ?? "").localeCompare(right.dueAt ?? right.opensAt ?? ""),
  );
}

export function parseCalendar(ics: string): CampusTask[] {
  const root = new ICAL.Component(ICAL.parse(ics));
  const events = root.getAllSubcomponents("vevent");

  const parsed = events
    .map((component): CalendarEvent | null => {
      const event = new ICAL.Event(component);
      const externalId = cleanText(event.uid);
      const title = cleanText(event.summary);

      if (!externalId || !title || !event.startDate) return null;

      const description = cleanText(event.description);
      const { phase, baseTitle } = eventPhase(title);

      return {
        externalId,
        title,
        baseTitle,
        phase,
        description,
        course: courseName(component),
        sourceUrl: eventUrl(component, description),
        occurredAt: event.startDate.toJSDate().toISOString(),
      };
    })
    .filter((event): event is CalendarEvent => event !== null);

  return consolidateEvents(parsed);
}
