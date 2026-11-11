import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { parseTravelFile } from "../src/travel-formats.ts";
const dom = new JSDOM();
Object.assign(globalThis, {
  DOMParser: dom.window.DOMParser,
  XMLSerializer: dom.window.XMLSerializer,
});
const sample = {
  title: "Kyoto",
  extra: { preserve: true },
  days: [
    {
      date: "2026-11-18",
      extra: 7,
      stops: [
        {
          name: "Cafe",
          time: "09:00",
          estimatedCostUsd: 10,
          notes: "Hi",
          custom: "retain",
        },
      ],
    },
  ],
};
test("trip preserves unknown fields and validates edits", () => {
  const doc = parseTravelFile("test.trip", JSON.stringify(sample));
  doc.set(0, "time", "09:30");
  doc.set(0, "estimatedCostUsd", "12");
  const result = JSON.parse(doc.serialize());
  assert.equal(result.days[0].stops[0].time, "09:30");
  assert.equal(result.extra.preserve, true);
  assert.equal(result.days[0].stops[0].custom, "retain");
  assert.throws(() => doc.set(0, "time", "25:00"));
  assert.throws(() => doc.set(0, "estimatedCostUsd", ""));
});
const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Wayfinder//Test//EN\r\nBEGIN:VEVENT\r\nUID:kyoto-test\r\nDTSTART;TZID=Asia/Tokyo:20261118T090000\r\nDTEND;TZID=Asia/Tokyo:20261118T100000\r\nSUMMARY:Coffee\r\nRRULE:FREQ=DAILY;COUNT=2\r\nX-KEEP:yes\r\nBEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT15M\r\nDESCRIPTION:Reminder\r\nEND:VALARM\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
test("calendar preserves time zone, UID, recurrence, alarms and custom properties", () => {
  const doc = parseTravelFile("test.ics", ics);
  doc.set(0, "summary", "Coffee, tea; and cake");
  doc.set(0, "dtstart", "2026-11-18T09:30:00");
  const text = doc.serialize();
  assert.match(text, /DTSTART;TZID=Asia\/Tokyo:20261118T093000/);
  assert.match(text, /UID:kyoto-test/);
  assert.match(text, /RRULE:FREQ=DAILY;COUNT=2/);
  assert.match(text, /BEGIN:VALARM/);
  assert.match(text, /X-KEEP:yes/);
  assert.equal(
    parseTravelFile("test.ics", text).rows[0].fields[0].value,
    "Coffee, tea; and cake",
  );
  assert.throws(() => doc.set(0, "dtstart", "2026-13-18T09:30:00"));
});
test("calendar all-day and UTC formats retained", () => {
  for (const [original, changed] of [
    ["DTSTART;VALUE=DATE:20261118", "2026-11-19"],
    ["DTSTART:20261118T090000Z", "2026-11-19T09:00:00Z"],
  ]) {
    const text = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\n${original}\r\nEND:VEVENT\r\nEND:VCALENDAR`;
    const doc = parseTravelFile("test.ics", text);
    doc.set(0, "dtstart", changed);
    assert.equal(
      parseTravelFile("test.ics", doc.serialize()).rows[0].fields[1].value,
      changed,
    );
  }
});
test("GPX edits preserve namespaces, track segmentation and extension metadata", () => {
  const text =
    '<gpx xmlns="http://www.topografix.com/GPX/1/1" xmlns:x="urn:test" version="1.1"><metadata><name>Kyoto</name></metadata><trk><trkseg><trkpt lat="35" lon="135"><ele>50</ele><extensions><x:keep>yes</x:keep></extensions></trkpt></trkseg></trk></gpx>';
  const doc = parseTravelFile("test.gpx", text);
  doc.set(0, "lat", "35.1");
  doc.set(0, "ele", "55");
  const out = doc.serialize();
  assert.match(out, /lat="35.1"/);
  assert.match(out, /<ele>55<\/ele>/);
  assert.match(out, /<x:keep>yes<\/x:keep>/);
  assert.match(out, /<trkseg>/);
  assert.throws(() => doc.set(0, "lon", "181"));
  assert.throws(() => parseTravelFile("bad.gpx", "<!DOCTYPE gpx><gpx/>"));
  assert.throws(() => parseTravelFile("bad.gpx", "<gpx><unclosed>"));
});

test("trip dragging swaps time slots without losing stop data", () => {
  const input = structuredClone(sample);
  input.days[0].stops.push({
    name: "Walk",
    time: "10:00",
    estimatedCostUsd: 0,
    notes: "Outside",
    custom: "two",
  });
  const doc = parseTravelFile("test.trip", JSON.stringify(input));
  doc.move!(0, 1);
  const rows = JSON.parse(doc.serialize()).days[0].stops;
  assert.equal(rows[0].name, "Walk");
  assert.equal(rows[0].time, "09:00");
  assert.equal(rows[1].name, "Cafe");
  assert.equal(rows[1].time, "10:00");
  assert.equal(rows[1].custom, "retain");
});
