import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";
const directory = await mkdtemp(join(tmpdir(), "wayfinder-mentions-"));
let client;
let response = {
  action: "accept",
  content: { roomType: "machiya-garden", includeTeaBreakfast: false },
};
let request;
async function connect(capabilities) {
  client = new Client(
    { name: "section8-test", version: "1.0.0" },
    { capabilities },
  );
  for (const method of ["elicitation/create", "openai/elicitation/create"]) {
    client.setRequestHandler(
      z.object({ method: z.literal(method), params: z.any() }),
      async (r) => {
        request = r;
        return response;
      },
    );
  }
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
  await connect({
    elicitation: { form: {} },
    extensions: { "openai/elicitation": { form: {} } },
  });
  assert.equal(
    client.getServerCapabilities().extensions["openai/mentions"].searchTool,
    "wayfinder.mentions",
  );
  assert.deepEqual(
    (await call("wayfinder.mentions")).structuredContent.items,
    [],
  );
  const trip = {
    id: "kyoto-test",
    title: "Kyoto Test",
    destination: "Higashiyama, Kyoto",
    currency: "JPY",
    days: [
      {
        date: "2026-11-18",
        stops: [{ time: "09:00", name: "Cafe", estimatedCostUsd: 10 }],
      },
    ],
  };
  await call("wayfinder.save_trip", { trip });
  const items = (
    await call("wayfinder.mentions", { query: "  KYOTO  Higashiyama " })
  ).structuredContent.items;
  assert.equal(items.length, 1);
  assert.equal(items[0].uri, "wayfinder://trips/kyoto-test");
  assert.deepEqual(
    (await call("wayfinder.mentions", { query: "Osaka" })).structuredContent
      .items,
    [],
  );
  assert.equal(
    JSON.parse(
      (await client.readResource({ uri: items[0].uri })).contents[0].text,
    ).title,
    "Kyoto Test",
  );
  await assert.rejects(() =>
    client.readResource({ uri: "wayfinder://trips/missing" }),
  );
  let chosen = await call("wayfinder.select_stay_style");
  assert.equal(chosen.structuredContent.includeTeaBreakfast, false);
  assert.equal(request.method, "openai/elicitation/create");
  assert.ok(
    request.params.requestedSchema.properties.roomType.oneOf.every((o) =>
      o["x-openai-thumbnail"].src.startsWith("data:image/"),
    ),
  );
  for (const action of ["cancel", "decline"]) {
    response = { action };
    assert.equal(
      (await call("wayfinder.select_stay_style")).structuredContent.status,
      action,
    );
  }
  response = {
    action: "accept",
    content: { roomType: "not-a-room", includeTeaBreakfast: true },
  };
  assert.ok((await call("wayfinder.select_stay_style")).isError);
  await client.close();
  response = {
    action: "accept",
    content: { roomType: "river-loft", includeTeaBreakfast: true },
  };
  await connect({ elicitation: { form: {} } });
  assert.equal(
    (await call("wayfinder.select_stay_style")).structuredContent.roomType,
    "river-loft",
  );
  assert.equal(request.method, "elicitation/create");
  assert.ok(
    !request.params.requestedSchema.properties.roomType.oneOf[0][
      "x-openai-thumbnail"
    ],
  );
  await client.close();
  // No handlers are needed on a host that does not support forms.
  client = new Client({ name: "no-forms", version: "1.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: "node",
      args: ["../plugins/wayfinder/server/dist/stdio.mjs"],
      env: { ...process.env, WAYFINDER_DATA_DIR: directory },
    }),
  );
  assert.ok((await call("wayfinder.select_stay_style")).isError);
  console.log(
    "PASS: mention discovery/search/resource reads; thumbnail, standard and unsupported forms; acceptance, cancel, decline and invalid responses.",
  );
} finally {
  await client?.close();
  await rm(directory, { recursive: true, force: true });
}
