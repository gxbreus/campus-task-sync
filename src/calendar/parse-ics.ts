import ICAL from "ical.js";

import type { CampusTask } from "../domain/task.js";

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

export function parseCalendar(ics: string): CampusTask[] {
  const root = new ICAL.Component(ICAL.parse(ics));
  const events = root.getAllSubcomponents("vevent");

  return events
    .map((component): CampusTask | null => {
      const event = new ICAL.Event(component);
      const externalId = cleanText(event.uid);
      const title = cleanText(event.summary);

      if (!externalId || !title || !event.startDate) return null;

      const description = cleanText(event.description);
      const endDate = event.endDate?.toJSDate();

      return {
        externalId,
        title,
        description,
        course: courseName(component),
        sourceUrl: eventUrl(component, description),
        startsAt: event.startDate.toJSDate().toISOString(),
        ...(endDate ? { endsAt: endDate.toISOString() } : {}),
      };
    })
    .filter((event): event is CampusTask => event !== null)
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}
