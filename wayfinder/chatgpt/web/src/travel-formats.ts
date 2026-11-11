import ICAL from "ical.js";
import { z } from "zod";

export interface Field {
  key: string;
  label: string;
  value: string;
  type?: string;
}
export interface Row {
  title: string;
  fields: Field[];
}
export interface TravelDocument {
  kind: string;
  rows: Row[];
  elevations?: number[];
  set: (row: number, key: string, value: string) => void;
  serialize: () => string;
  move?: (from: number, to: number) => void;
}
const stop = z
  .object({
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    name: z.string().min(1),
    estimatedCostUsd: z.number().nonnegative(),
    notes: z.string().optional(),
  })
  .passthrough();
const trip = z
  .object({
    title: z.string(),
    days: z.array(
      z.object({ date: z.iso.date(), stops: z.array(stop) }).passthrough(),
    ),
  })
  .passthrough();

export function parseTravelFile(name: string, text: string): TravelDocument {
  if (text.length > 2_000_000)
    throw new Error("Files above 2 MB are not supported by this editor.");
  if (/\.trip$/i.test(name)) {
    const value = trip.parse(JSON.parse(text));
    const refs = value.days.flatMap((day) =>
      day.stops.map((item) => ({ day, item })),
    );
    return {
      kind: value.title,
      rows: refs.map(({ day, item }) => ({
        title: day.date,
        fields: [
          { key: "time", label: "Time", value: item.time, type: "time" },
          { key: "name", label: "Stop", value: item.name },
          {
            key: "estimatedCostUsd",
            label: "Estimated cost (USD)",
            value: String(item.estimatedCostUsd),
            type: "number",
          },
          { key: "notes", label: "Notes", value: item.notes ?? "" },
        ],
      })),
      set(index, key, input) {
        const item = refs[index].item;
        if (key === "estimatedCostUsd") {
          if (
            !input.trim() ||
            !Number.isFinite(Number(input)) ||
            Number(input) < 0
          )
            throw new Error("Cost must be a nonnegative number.");
          item.estimatedCostUsd = Number(input);
        } else if (key === "time") {
          if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input))
            throw new Error("Use a valid HH:MM time.");
          item.time = input;
        } else if (key === "name") {
          if (!input.trim()) throw new Error("Stop name is required.");
          item.name = input;
        } else if (key === "notes") item.notes = input;
      },
      move(from, to) {
        const a = refs[from],
          b = refs[to];
        if (a.day !== b.day)
          throw new Error(
            "Drag stops within the same day. Edit dates separately in your itinerary source.",
          );
        const first = a.day.stops.indexOf(a.item),
          second = b.day.stops.indexOf(b.item);
        [a.item.time, b.item.time] = [b.item.time, a.item.time];
        [a.day.stops[first], a.day.stops[second]] = [
          a.day.stops[second],
          a.day.stops[first],
        ];
      },
      serialize() {
        trip.parse(value);
        return JSON.stringify(value, null, 2) + "\n";
      },
    };
  }
  if (/\.ics$/i.test(name)) {
    const calendar = new ICAL.Component(ICAL.parse(text));
    if (calendar.name !== "vcalendar")
      throw new Error("Expected a VCALENDAR document.");
    const events = calendar.getAllSubcomponents("vevent");
    return {
      kind: "Calendar events",
      rows: events.map((event) => ({
        title: `Event · ${event.getFirstProperty("dtstart")?.getParameter("tzid") || "UTC (Z) or floating local time"}`,
        fields: [
          {
            key: "summary",
            label: "Event",
            value: String(event.getFirstPropertyValue("summary") ?? ""),
          },
          ...["dtstart", "dtend"]
            .filter((key) => event.hasProperty(key))
            .map((key) => ({
              key,
              label:
                key === "dtstart"
                  ? "Start (keep date/time format)"
                  : "End (keep date/time format)",
              value: String(event.getFirstPropertyValue(key)),
            })),
          {
            key: "location",
            label: "Location",
            value: String(event.getFirstPropertyValue("location") ?? ""),
          },
          {
            key: "description",
            label: "Notes",
            value: String(event.getFirstPropertyValue("description") ?? ""),
          },
        ],
      })),
      set(index, key, input) {
        const event = events[index];
        if (["dtstart", "dtend"].includes(key)) {
          const property = event.getFirstProperty(key)!;
          const previous = property.getFirstValue() as ICAL.Time;
          const pattern = previous.isDate
            ? /^\d{4}-\d{2}-\d{2}$/
            : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z?$/;
          if (
            !pattern.test(input) ||
            input.endsWith("Z") !== previous.toString().endsWith("Z")
          )
            throw new Error(
              "Keep the original date/time format and UTC suffix.",
            );
          const next = ICAL.Time.fromString(input, property);
          if (next.toString() !== input)
            throw new Error("Invalid calendar date or time.");
          next.zone = previous.zone;
          property.setValue(next);
        } else if (["summary", "location", "description"].includes(key))
          event.updatePropertyWithValue(key, input);
      },
      serialize() {
        return calendar.toString() + "\r\n";
      },
    };
  }
  if (/\.gpx$/i.test(name)) {
    if (/<!DOCTYPE|<!ENTITY/i.test(text))
      throw new Error("GPX documents with DTDs or entities are not supported.");
    const xml = new DOMParser().parseFromString(text, "application/xml");
    if (
      xml.querySelector("parsererror") ||
      xml.documentElement.localName !== "gpx"
    )
      throw new Error("Invalid GPX XML.");
    const points = Array.from(xml.getElementsByTagNameNS("*", "trkpt")).concat(
      Array.from(xml.getElementsByTagNameNS("*", "rtept")),
      Array.from(xml.getElementsByTagNameNS("*", "wpt")),
    );
    const child = (node: Element, key: string) =>
      Array.from(node.children).find((c) => c.localName === key);
    for (const p of points) {
      const lat = Number(p.getAttribute("lat")),
        lon = Number(p.getAttribute("lon"));
      if (
        !p.hasAttribute("lat") ||
        !p.hasAttribute("lon") ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        Math.abs(lat) > 90 ||
        Math.abs(lon) > 180
      )
        throw new Error("GPX contains invalid coordinates.");
    }
    return {
      kind: "Route points",
      elevations: points.map((p) =>
        Number(child(p, "ele")?.textContent ?? NaN),
      ),
      rows: points.map((p, index) => ({
        title: `Point ${index + 1}`,
        fields: [
          {
            key: "lat",
            label: "Latitude",
            value: p.getAttribute("lat")!,
            type: "number",
          },
          {
            key: "lon",
            label: "Longitude",
            value: p.getAttribute("lon")!,
            type: "number",
          },
          ...(child(p, "ele")
            ? [
                {
                  key: "ele",
                  label: "Elevation (m)",
                  value: child(p, "ele")!.textContent ?? "",
                  type: "number",
                },
              ]
            : []),
          ...(child(p, "name")
            ? [
                {
                  key: "name",
                  label: "Name",
                  value: child(p, "name")!.textContent ?? "",
                },
              ]
            : []),
        ],
      })),
      set(index, key, input) {
        if (key !== "name") {
          const number = Number(input);
          if (
            !input.trim() ||
            !Number.isFinite(number) ||
            (key === "lat" && Math.abs(number) > 90) ||
            (key === "lon" && Math.abs(number) > 180)
          )
            throw new Error("Invalid coordinate or elevation.");
        }
        if (key === "lat" || key === "lon")
          points[index].setAttribute(key, input);
        else {
          const node = child(points[index], key);
          if (node) node.textContent = input;
        }
      },
      serialize() {
        return new XMLSerializer().serializeToString(xml);
      },
    };
  }
  throw new Error("Supported files: .trip, .ics, .gpx");
}
