import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { build } from "../../server/node_modules/esbuild/lib/main.js";
const built = await build({
  entryPoints: ["src/file-editor.ts"],
  bundle: true,
  write: false,
  format: "esm",
  loader: { ".css": "empty" },
  plugins: [
    {
      name: "mock-host",
      setup(b) {
        b.onResolve({ filter: /^@modelcontextprotocol\/ext-apps$/ }, () => ({
          path: "host",
          namespace: "mock",
        }));
        b.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
          contents: `export class App {
 constructor(){window.mockApp=this;}
 async connect(){await this.ontoolinput({arguments:{file:{name:'test.trip',resourceUri:'host-resource://test'}}});}
 getHostContext(){return {};}
 request(request){return window.hostRequest(request);}
 } export function applyDocumentTheme(){} export function applyHostStyleVariables(){}`,
        }));
      },
    },
  ],
});
const source = built.outputFiles[0].text;
const text = JSON.stringify({
  title: "Kyoto",
  days: [
    {
      date: "2026-11-18",
      stops: [{ time: "09:00", name: "Cafe", estimatedCostUsd: 10 }],
    },
  ],
});
const tick = () => new Promise((r) => setTimeout(r, 5));
async function setup(writable = true) {
  const dom = new JSDOM('<main id="app"></main>', {
    runScripts: "outside-only",
    url: "https://test.invalid",
  });
  let outcome = "saved";
  const requests = [];
  dom.window.hostRequest = async (request) => {
    requests.push(request);
    if (request.method === "resources/read")
      return {
        contents: [
          {
            uri: "host-resource://test",
            text,
            _meta: { "openai/resource": { writable, etag: "v1" } },
          },
        ],
      };
    return outcome === "too-large"
      ? { outcome, maxBytes: 1 }
      : { outcome, etag: "v2" };
  };
  await dom.window.eval(`(async()=>{${source}\n})()`);
  return {
    dom,
    requests,
    setOutcome(value) {
      outcome = value;
    },
  };
}
function edit(dom) {
  const input = [...dom.window.document.querySelectorAll("input")].find(
    (i) => i.value === "Cafe",
  );
  input.value = "New cafe";
  input.dispatchEvent(new dom.window.Event("input"));
}
function save(dom) {
  [...dom.window.document.querySelectorAll("button")]
    .find((b) => b.textContent === "Save to file")
    .click();
}
test("host save uses opaque URI and ETag, then clears dirty state", async () => {
  const { dom, requests } = await setup();
  edit(dom);
  save(dom);
  await tick();
  const write = requests.find((r) => r.method === "openai/resources/write");
  assert.equal(write.params.uri, "host-resource://test");
  assert.equal(write.params.ifMatch, "v1");
  assert.match(write.params.text, /New cafe/);
  assert.match(dom.window.document.body.textContent, /Saved to the original/);
  dom.window.close();
});
test("read-only host cannot save", async () => {
  const { dom, requests } = await setup(false);
  assert.ok(
    [...dom.window.document.querySelectorAll("input")].every((i) => i.disabled),
  );
  save(dom);
  await tick();
  assert.equal(
    requests.filter((r) => r.method === "openai/resources/write").length,
    0,
  );
  dom.window.close();
});
test("conflict retains edits and old ETag; too-large is not success", async () => {
  const { dom, requests, setOutcome } = await setup();
  setOutcome("conflict");
  edit(dom);
  save(dom);
  await tick();
  assert.match(
    dom.window.document.body.textContent,
    /Not saved: the file changed/,
  );
  assert.ok(
    [...dom.window.document.querySelectorAll("input")].some(
      (i) => i.value === "New cafe",
    ),
  );
  setOutcome("too-large");
  save(dom);
  await tick();
  assert.match(
    dom.window.document.body.textContent,
    /Not saved: the host limits/,
  );
  assert.equal(
    requests.filter((r) => r.method === "openai/resources/write")[1].params
      .ifMatch,
    "v1",
  );
  dom.window.close();
});
