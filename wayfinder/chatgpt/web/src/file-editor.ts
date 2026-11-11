import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
} from "@modelcontextprotocol/ext-apps";
import { z } from "zod";
import { parseTravelFile, type TravelDocument } from "./travel-formats";
import "./workspace.css";
import "./file-editor.css";

const app = new App({ name: "Wayfinder File Editor", version: "1.0.0" });
const inputSchema = z.object({
  file: z.object({ name: z.string(), resourceUri: z.string().min(1) }),
});
const readSchema = z.object({
  contents: z.array(
    z.object({
      uri: z.string(),
      text: z.string(),
      _meta: z
        .object({
          "openai/resource": z
            .object({
              writable: z.boolean().optional(),
              etag: z.string().optional(),
            })
            .optional(),
        })
        .optional(),
    }),
  ),
});
const writeSchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("saved"), etag: z.string() }),
  z.object({ outcome: z.literal("conflict"), etag: z.string() }),
  z.object({ outcome: z.literal("too-large"), maxBytes: z.number() }),
]);
const root = document.querySelector<HTMLElement>("#app")!;
let file: z.infer<typeof inputSchema>["file"] | undefined;
let documentModel: TravelDocument | undefined;
let original = "";
let etag: string | undefined;
let writable = false;
let dirty = false;
let busy = false;
let generation = 0;
let notice = "";
let page = 0;
let draggedRow: number | undefined;
const invalid = new Set<string>();
let connected = false;
let saveButton: HTMLButtonElement;
let status: HTMLElement;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = "") {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}
function button(text: string, action: () => Promise<void> | void) {
  const b = el("button", text);
  b.onclick = async () => {
    try {
      await action();
    } catch (e) {
      notice = e instanceof Error ? e.message : String(e);
      render();
    }
  };
  return b;
}
function updateStatus() {
  if (saveButton)
    saveButton.disabled =
      busy || !dirty || !writable || !etag || invalid.size > 0;
  if (status)
    status.textContent =
      notice ||
      (invalid.size
        ? "Correct the highlighted fields before saving."
        : dirty
          ? "Unsaved changes"
          : documentModel
            ? "No unsaved changes"
            : "Opening file…");
}
async function read() {
  if (!file || !connected || busy) return;
  const current = ++generation;
  const target = file;
  busy = true;
  notice = "Reading file…";
  render();
  try {
    const result = await app.request(
      {
        method: "resources/read",
        params: {
          uri: target.resourceUri,
          _meta: { "openai/resource": { representation: "text" } },
        },
      },
      readSchema,
    );
    if (current !== generation) return;
    const item = result.contents.find((c) => c.uri === target.resourceUri);
    if (!item) throw new Error("The host returned no text for this file.");
    const parsed = parseTravelFile(target.name, item.text);
    documentModel = parsed;
    original = item.text;
    const metadata = item._meta?.["openai/resource"];
    etag = metadata?.etag;
    writable = metadata?.writable === true;
    dirty = false;
    invalid.clear();
    page = 0;
    notice =
      writable && etag
        ? "File loaded."
        : "Read-only: the host did not provide write permission and a version token.";
  } catch (e) {
    notice = `Could not read file: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    if (current === generation) {
      busy = false;
      render();
    }
  }
}
async function save() {
  if (
    !file ||
    !documentModel ||
    busy ||
    !dirty ||
    !writable ||
    !etag ||
    invalid.size
  )
    return;
  const text = documentModel.serialize();
  parseTravelFile(file.name, text);
  busy = true;
  notice = "Saving…";
  render();
  try {
    const result = await app.request(
      {
        method: "openai/resources/write",
        params: { uri: file.resourceUri, text, ifMatch: etag },
      },
      writeSchema,
    );
    if (result.outcome === "conflict")
      notice =
        "Not saved: the file changed elsewhere. Your edits remain here. Copy your edited source below, then reload to review the latest file. There is no force-overwrite button.";
    else if (result.outcome === "too-large")
      notice = `Not saved: the host limits files to ${result.maxBytes} bytes.`;
    else {
      etag = result.etag;
      original = text;
      dirty = false;
      notice = "Saved to the original file.";
    }
  } catch (e) {
    notice = `Save failed; edits retained: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    busy = false;
    render();
  }
}
function render() {
  root.replaceChildren();
  const header = el("header");
  header.append(
    el("p", "WAYFINDER · FILE EDITOR"),
    el("h1", file?.name ?? "Travel file editor"),
  );
  root.append(header);
  status = el("p");
  status.setAttribute("role", "status");
  root.append(status);
  const nav = el("nav");
  saveButton = button("Save to file", save);
  nav.append(saveButton);
  const reload = button("Reload from file", async () => {
    if (dirty || invalid.size) {
      notice =
        "Reload will discard your unsaved edits. Use Confirm discard and reload below.";
      render();
      const confirm = button("Confirm discard and reload", async () => {
        await read();
      });
      root.prepend(confirm);
    } else await read();
  });
  reload.disabled = busy;
  nav.append(reload);
  root.append(nav);
  if (!documentModel) {
    root.append(
      el(
        "p",
        "Open an attached .trip, .ics or .gpx file with Wayfinder in a local Work conversation.",
      ),
    );
    updateStatus();
    return;
  }
  root.append(el("h2", documentModel.kind));
  if (documentModel.move)
    root.append(
      el(
        "p",
        "Drag a stop onto another stop in the same day to swap their time slots, or edit the time fields directly.",
      ),
    );
  if (file?.name.endsWith(".ics"))
    root.append(
      el(
        "p",
        "Calendar dates keep their original time zone and all-day format. Editing a recurring event changes its series definition; recurrence rules and alarms are retained.",
      ),
    );
  if (documentModel.elevations?.some(Number.isFinite)) {
    const values = documentModel.elevations;
    const finite = values.filter(Number.isFinite);
    const min = Math.min(...finite),
      max = Math.max(...finite);
    const figure = el("figure");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 600 140");
    svg.setAttribute("role", "img");
    svg.setAttribute(
      "aria-label",
      `Elevation profile from ${min} to ${max} meters, by point order`,
    );
    let path = "";
    let previous = false;
    values.forEach((value, i) => {
      if (!Number.isFinite(value)) {
        previous = false;
        return;
      }
      path += `${previous ? "L" : "M"}${10 + (i / Math.max(1, values.length - 1)) * 580},${130 - ((value - min) / Math.max(1, max - min)) * 120} `;
      previous = true;
    });
    const line = document.createElementNS(svg.namespaceURI, "path");
    line.setAttribute("d", path);
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", "#3b9983");
    line.setAttribute("stroke-width", "3");
    svg.append(line);
    figure.append(
      svg,
      el(
        "figcaption",
        `Elevation: ${min}–${max} m · horizontal axis is point order, not distance`,
      ),
    );
    root.append(figure);
  }
  const start = page * 50;
  documentModel.rows.slice(start, start + 50).forEach((row, offset) => {
    const index = start + offset;
    const card = el("section");
    if (documentModel!.move && writable && etag && !busy && !invalid.size) {
      card.draggable = true;
      card.ondragstart = () => {
        draggedRow = index;
      };
      card.ondragover = (event) => event.preventDefault();
      card.ondrop = (event) => {
        event.preventDefault();
        if (draggedRow === undefined || draggedRow === index) return;
        try {
          documentModel!.move!(draggedRow, index);
          documentModel = parseTravelFile(
            file!.name,
            documentModel!.serialize(),
          );
          dirty = true;
          notice = "Stop time slots swapped. Save to keep this change.";
        } catch (e) {
          notice = String(e);
        }
        draggedRow = undefined;
        render();
      };
    }
    card.append(el("h3", row.title));
    const fields = el("div");
    fields.className = "fields";
    row.fields.forEach((field) => {
      const label = el("label", field.label);
      const input = el("input");
      input.type = field.type ?? "text";
      input.value = field.value;
      if (input.type === "number") input.step = "any";
      input.disabled = busy || !writable || !etag;
      const key = `${index}/${field.key}`;
      if (invalid.has(key)) input.setAttribute("aria-invalid", "true");
      input.oninput = () => {
        field.value = input.value;
        try {
          documentModel!.set(index, field.key, input.value);
          invalid.delete(key);
          input.removeAttribute("aria-invalid");
          notice = "";
        } catch (e) {
          invalid.add(key);
          input.setAttribute("aria-invalid", "true");
          notice = String(e);
        }
        dirty = true;
        updateStatus();
      };
      label.append(input);
      fields.append(label);
    });
    card.append(fields);
    root.append(card);
  });
  if (!documentModel.rows.length)
    root.append(
      el("p", "No editable events, stops or points in this document."),
    );
  if (documentModel.rows.length > 50) {
    const paging = el("nav");
    const prev = button("Previous", () => {
      page--;
      render();
    });
    prev.disabled = page === 0;
    const next = button("Next", () => {
      page++;
      render();
    });
    next.disabled = start + 50 >= documentModel.rows.length;
    paging.append(
      prev,
      el(
        "p",
        `${start + 1}–${Math.min(start + 50, documentModel.rows.length)} of ${documentModel.rows.length}`,
      ),
      next,
    );
    root.append(paging);
  }
  const details = el("details");
  details.append(el("summary", "Edited source (copy to keep a backup)"));
  const source = el("textarea");
  source.readOnly = true;
  source.setAttribute("aria-label", "Edited file source");
  details.ontoggle = () => {
    if (details.open)
      source.value = dirty ? documentModel!.serialize() : original;
  };
  details.append(source);
  root.append(details);
  updateStatus();
}
app.ontoolinput = async ({ arguments: args }) => {
  try {
    const next = inputSchema.parse(args).file;
    if (file?.resourceUri === next.resourceUri) return;
    if (dirty || busy) {
      notice = "Finish saving or reload this file before opening another one.";
      updateStatus();
      return;
    }
    file = next;
    documentModel = undefined;
    etag = undefined;
    writable = false;
    await read();
  } catch (e) {
    notice = String(e);
    render();
  }
};
app.onhostcontextchanged = (context) => {
  if (context.theme) applyDocumentTheme(context.theme);
  if (context.styles?.variables)
    applyHostStyleVariables(context.styles.variables);
};
await app.connect();
connected = true;
const context = app.getHostContext();
if (context?.theme) applyDocumentTheme(context.theme);
if (context?.styles?.variables)
  applyHostStyleVariables(context.styles.variables);
if (file) await read();
