import assert from "node:assert/strict";
import { mkdtemp, cp, readFile, readdir, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const temp = await mkdtemp(join(tmpdir(), "wayfinder-package-"));
let client;
async function connect() {
  client = new Client({ name: "clean-install-test", version: "1.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: "node",
      args: [join(temp, "plugin/server/dist/stdio.mjs")],
      cwd: temp,
      env: {
        ...process.env,
        WAYFINDER_SETTINGS_DIR: join(temp, "prefs"),
        WAYFINDER_DATA_DIR: join(temp, "trips"),
      },
    }),
  );
}
const call = (name, args = {}) => client.callTool({ name, arguments: args });
try {
  const source = resolve("../plugins/wayfinder");
  await cp(source, join(temp, "plugin"), { recursive: true });
  const manifest = JSON.parse(
    await readFile(join(source, "plugin.json"), "utf8"),
  );
  for (const file of [
    "server/dist/stdio.mjs",
    "web/dist/explore.html",
    "web/dist/workspace.html",
    "web/dist/file-editor.html",
    manifest.extensions["com.openai"].onboardingSkill,
    manifest.extensions["com.openai"].interface.logo,
    "LICENSE",
  ])
    await access(join(source, file));
  assert.equal(
    JSON.parse(
      await readFile(join(source, ".codex-plugin/plugin.json"), "utf8"),
    ).version,
    manifest.version,
  );
  const skills = await readdir(join(source, "skills"));
  assert.equal(skills.length, 3);
  for (const skill of skills) {
    const path = join(source, "skills", skill, "SKILL.md");
    const text = await readFile(path, "utf8");
    assert.match(text, /^---\nname: .+\ndescription: .+\n---/);
    for (const [, link] of text.matchAll(/\]\(([^)]+\.md)\)/g))
      await access(resolve(dirname(path), link));
  }
  await connect();
  assert.deepEqual(
    client.getServerCapabilities().extensions["openai/settings"],
    { readTool: "settings.read", updateTool: "settings.update" },
  );
  const initial = await call("settings.read");
  assert.ok(!initial.isError);
  assert.equal(initial.structuredContent.values.homeAirport, "");
  assert.equal(initial.structuredContent.layout[0].kind, "group");
  const updated = await call("settings.update", {
    set: {
      homeAirport: "YYZ",
      baseCurrency: "CAD",
      walkingPace: "relaxed",
      dietaryNotes: "Vegetarian",
    },
  });
  assert.ok(!updated.isError);
  await client.close();
  await connect();
  assert.deepEqual(
    (await call("settings.read")).structuredContent.values,
    updated.structuredContent.values,
  );
  assert.ok(
    (await call("settings.update", { set: { baseCurrency: "INVALID" } }))
      .isError,
  );
  assert.ok(
    (await call("settings.update", { set: { unexpected: true } })).isError,
  );
  assert.ok((await call("settings.update", { set: {} })).isError);
  await Promise.all([
    call("settings.update", { set: { baseCurrency: "JPY" } }),
    call("settings.update", { set: { walkingPace: "brisk" } }),
  ]);
  const concurrent = (await call("settings.read")).structuredContent.values;
  assert.equal(concurrent.baseCurrency, "JPY");
  assert.equal(concurrent.walkingPace, "brisk");
  assert.equal(concurrent.homeAirport, "YYZ");
  await call("settings.update", { set: { homeAirport: "" } });
  assert.equal(
    (await call("settings.read")).structuredContent.values.homeAirport,
    "",
  );
  const dashboard = await call("wayfinder.dashboard");
  assert.equal(
    dashboard.structuredContent.pluginRoute,
    "wayfinder@wayfinder-oss",
  );
  const resources = await client.listResources();
  for (const resource of resources.resources) {
    const data = await client.readResource({ uri: resource.uri });
    assert.ok(data.contents[0].text.length > 100);
  }
  console.log(
    "PASS: clean bundled package without node_modules; manifests/assets/three skills; settings schema, persistence, partial/concurrent updates, resets and validation; all UI resources.",
  );
} finally {
  await client?.close();
  await rm(temp, { recursive: true, force: true });
}
