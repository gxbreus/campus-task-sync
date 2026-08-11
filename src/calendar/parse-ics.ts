import { createHash } from "node:crypto";

import ICAL from "ical.js";

import type { CampusTask } from "../domain/task.js";
import { courseNameFromCode } from "./course-names.js";

type EventPhase = "opening" | "closing" | "single";

type CalendarEvent = Omit<
  CampusTask,
  "externalId" | "opensAt" | "dueAt" | "openingInformation"
> & {
  externalId: string;
  occurredAt: string;
  phase: EventPhase;
  baseTitle: string;
};

function cleanText(value: string | null | undefined): string | undefined {
  const cleaned = value?.replace(/\\n/g, "\n").trim();
  return cleaned || undefined;
}

function cleanEventTitle(value: string): string {
  return value.replace(/\s+est[aá]\s+marcado\(a\)\s+para\s+esta\s+data\s*$/i, "").trim();
}

function eventUrl(
  component: ICAL.Component,
  externalId: string,
  occurredAt: string,
  campusBaseUrl?: string,
  description?: string,
): string | undefined {
  const rawUrl = component.getFirstPropertyValue("url");
  const explicitUrl = typeof rawUrl === "string" ? cleanText(rawUrl) : undefined;
  if (explicitUrl) return explicitUrl;

  const descriptionUrl = description?.match(/https?:\/\/[^\s<>"']+/)?.[0];
  if (descriptionUrl) return descriptionUrl;

  const eventId = externalId.match(/^(\d+)@/)?.[1];
  if (!campusBaseUrl || !eventId) return undefined;
  const time = Math.floor(new Date(occurredAt).getTime() / 1000);
  return `${campusBaseUrl}/calendar/view.php?view=day&time=${time}#event_${eventId}`;
}

function courseDetails(component: ICAL.Component): { code?: string; name?: string } {
  const categories = component.getFirstPropertyValue("categories");
  const value = Array.isArray(categories)
    ? cleanText(categories.join(", "))
    : typeof categories === "string"
      ? cleanText(categories)
      : undefined;
  const courseCode = value?.match(/^([A-Z]{2,}\d{3})/i)?.[1];
  const code = courseCode?.toUpperCase();
  return code ? { code, name: courseNameFromCode(code) } : { name: value };
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
  const identity = `${event.courseCode ?? event.course ?? ""}\n${event.baseTitle.toLocaleLowerCase("pt-BR")}`;
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
        courseCode: event.courseCode,
        sourceUrl: event.sourceUrl,
        dueAt: event.occurredAt,
        openingInformation: "Data não informada pelo calendário do Campus",
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
      courseCode: reference.courseCode,
      sourceUrl: closing?.sourceUrl ?? opening?.sourceUrl,
      ...(opening ? { opensAt: opening.occurredAt } : {}),
      ...(closing ? { dueAt: closing.occurredAt } : {}),
      openingInformation: opening
        ? "Data de abertura informada pelo Campus"
        : "Data não informada pelo calendário do Campus",
    });
  }

  return tasks.sort((left, right) =>
    (left.dueAt ?? left.opensAt ?? "").localeCompare(right.dueAt ?? right.opensAt ?? ""),
  );
}

export function parseCalendar(
  ics: string,
  options: { campusBaseUrl?: string } = {},
): CampusTask[] {
  const root = new ICAL.Component(ICAL.parse(ics));
  const events = root.getAllSubcomponents("vevent");

  const parsed = events
    .map((component): CalendarEvent | null => {
      const event = new ICAL.Event(component);
      const externalId = cleanText(event.uid);
      const rawTitle = cleanText(event.summary);

      if (!externalId || !rawTitle || !event.startDate) return null;

      const title = cleanEventTitle(rawTitle);
      const description = cleanText(event.description);
      const { phase, baseTitle } = eventPhase(title);
      const occurredAt = event.startDate.toJSDate().toISOString();
      const course = courseDetails(component);

      return {
        externalId,
        title,
        baseTitle,
        phase,
        description,
        course: course.name,
        courseCode: course.code,
        sourceUrl: eventUrl(
          component,
          externalId,
          occurredAt,
          options.campusBaseUrl,
          description,
        ),
        occurredAt,
      };
    })
    .filter((event): event is CalendarEvent => event !== null);

  return consolidateEvents(parsed);
}
