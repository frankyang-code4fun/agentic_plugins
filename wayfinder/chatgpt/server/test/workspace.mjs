import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const directory = await mkdtemp(join(tmpdir(), "wayfinder-test-"));
let client;
async function connect() {
  client = new Client({ name: "workspace-test", version: "1.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: "node",
      args: ["../plugins/wayfinder/server/dist/stdio.mjs"],
      env: { ...process.env, WAYFINDER_DATA_DIR: directory },
    }),
  );
}
const call = (name, args = {}) => client.callTool({ name, arguments: args });
try {
  await connect();
  const { tools } = await client.listTools();
  for (const [name, type] of [
    ["wayfinder.dashboard", "global"],
    ["wayfinder.itinerary_tray", "thread"],
  ]) {
    const tool = tools.find((t) => t.name === name);
    assert.deepEqual(tool._meta["openai/ui"].entrypoints, [{ type }]);
    const empty = await call(name);
    assert.ok(!empty.isError);
    assert.deepEqual(empty.structuredContent.trips, []);
    const resource = await client.readResource({
      uri: tool._meta.ui.resourceUri,
    });
    assert.match(resource.contents[0].text, /Your next chapter/);
    assert.ok(!resource.contents[0].text.includes('src="/src/'));
  }
  const fileTool = tools.find((t) => t.name === "wayfinder.open_file");
  assert.deepEqual(fileTool._meta["openai/ui"].entrypoints, [
    { type: "file", extensions: [".trip", ".ics", ".gpx"] },
  ]);
  const fileResult = await call("wayfinder.open_file", {
    file: { name: "test.trip", resourceUri: "host-resource://test" },
  });
  assert.equal(
    fileResult.structuredContent.file.resourceUri,
    "host-resource://test",
  );
  const fileResource = await client.readResource({
    uri: fileTool._meta.ui.resourceUri,
  });
  assert.match(fileResource.contents[0].text, /openai\/resources\/write/);
  assert.ok((await call("wayfinder.open_file", {})).isError);
  const trip = {
    id: "kyoto-test",
    title: "Kyoto test",
    destination: "Kyoto",
    currency: "JPY",
    days: [
      {
        date: "2026-11-18",
        stops: [
          { time: "09:00", name: "Cafe", estimatedCostUsd: 10, notes: "Test" },
        ],
      },
    ],
    checklist: [{ label: "Pack umbrella", done: false }],
  };
  assert.ok(!(await call("wayfinder.save_trip", { trip })).isError);
  await client.close();
  await connect();
  const saved = await call("wayfinder.dashboard", { tripId: trip.id });
  assert.deepEqual(saved.structuredContent.trips, [trip]);
  assert.equal(saved.structuredContent.activeTripId, trip.id);
  const tray = await call("wayfinder.itinerary_tray");
  assert.equal(tray.structuredContent.activeTripId, null);
  assert.equal(tray.structuredContent.trips.length, 1);
  assert.ok(
    (await call("wayfinder.save_trip", { trip: { ...trip, id: "../escape" } }))
      .isError,
  );
  const usd = await call("wayfinder.exchange_rate", { currency: "USD" });
  assert.equal(usd.structuredContent.rate, 1);
  console.log(
    "PASS: entrypoints accept {}, resources bundled, trips survive process restart, tray selection isolated, unsafe IDs rejected, USD rate correct.",
  );
} finally {
  await client?.close();
  await rm(directory, { recursive: true, force: true });
}
