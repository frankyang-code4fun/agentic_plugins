import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
} from "@modelcontextprotocol/ext-apps";
import { z } from "zod";
import "./workspace.css";

const tripSchema = z.object({
  id: z.string(),
  title: z.string(),
  destination: z.string(),
  currency: z.string(),
  days: z.array(
    z.object({
      date: z.string(),
      stops: z.array(
        z.object({
          time: z.string(),
          name: z.string(),
          estimatedCostUsd: z.number(),
          notes: z.string(),
        }),
      ),
    }),
  ),
  checklist: z.array(z.object({ label: z.string(), done: z.boolean() })),
});
const dataSchema = z.object({
  pluginRoute: z.string().default("wayfinder@wayfinder-oss"),
  mode: z.enum(["dashboard", "itinerary_tray"]),
  trips: z.array(tripSchema),
  activeTripId: z.string().nullable(),
});
type Trip = z.infer<typeof tripSchema>;
const app = new App({ name: "Wayfinder Workspace", version: "1.0.0" });
const root = document.querySelector<HTMLElement>("#app")!;
let data: z.infer<typeof dataSchema> = {
  pluginRoute: "wayfinder@wayfinder-oss",
  mode: "dashboard",
  trips: [],
  activeTripId: null,
};
let selectedId: string | null = null;
let error = "";
let connected = false;
let refreshing = false;
let fx: { currency: string; rate: number; date: string } | null = null;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = "") {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}
function button(text: string, action: () => Promise<void> | void) {
  const node = el("button", text);
  node.onclick = async () => {
    node.disabled = true;
    try {
      error = "";
      await action();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      render();
    }
  };
  return node;
}
function resultError(result: { isError?: boolean; content?: unknown }) {
  if (result.isError) throw new Error(JSON.stringify(result.content));
}
function accept(value: unknown) {
  const parsed = dataSchema.parse(value);
  data = parsed;
  if (parsed.activeTripId) selectedId = parsed.activeTripId;
  render();
}
function select(id: string) {
  selectedId = id;
  fx = null;
  void app
    .updateModelContext({
      structuredContent: {
        activeTripId: id,
        instruction: "Use this trip ID when saving itinerary updates.",
      },
    })
    .catch(() => {});
  render();
}
async function refresh() {
  if (refreshing || !connected) return;
  refreshing = true;
  try {
    const result = await app.callServerTool({
      name: `wayfinder.${data.mode}`,
      arguments: selectedId ? { tripId: selectedId } : {},
    });
    resultError(result);
    accept(result.structuredContent);
    error = "";
  } finally {
    refreshing = false;
  }
}
async function plan(trip?: Trip) {
  const result = await app.request(
    {
      method: "ui/message",
      params: {
        role: "user",
        content: [
          {
            type: "text",
            text: trip
              ? `Use Wayfinder to revise saved trip ${trip.id}: ${trip.title}. Ask what I want changed, then use wayfinder.save_trip to persist the updated itinerary.`
              : "Use Wayfinder to plan a walkable trip. Ask me for my destination, dates and budget, then save the agreed itinerary with wayfinder.save_trip.",
          },
        ],
        _meta: {
          "openai/message": {
            target: data.mode === "dashboard" ? "new" : "active",
            send: true,
          },
        },
      },
    },
    z.object({ isError: z.boolean().optional() }),
  );
  if (result.isError)
    throw new Error("The host could not open the planning conversation.");
}
function render() {
  root.replaceChildren();
  const header = el("header");
  header.append(
    el("p", "WAYFINDER"),
    el(
      "h1",
      data.mode === "dashboard" ? "Your next chapter" : "Itinerary & budget",
    ),
    el(
      "p",
      data.mode === "dashboard"
        ? "Saved trips, thoughtful days, room to wander."
        : "Choose a saved trip to follow alongside this conversation.",
    ),
  );
  root.append(header);
  const toolbar = el("nav");
  toolbar.append(
    button("Refresh trips", refresh),
    button("Plan a trip", () => plan()),
  );
  root.append(toolbar);
  if (error) {
    const notice = el("p", error);
    notice.setAttribute("role", "alert");
    notice.className = "error";
    root.append(notice);
  }
  if (!data.trips.length) {
    const empty = el("section");
    empty.append(
      el("h2", "A journey starts with a plan"),
      el(
        "p",
        "No saved trips yet. Plan a trip in chat and ask Wayfinder to save it. Your library stays on this computer across plugin updates.",
      ),
    );
    root.append(empty);
    return;
  }
  const layout = el("div");
  layout.className = "layout";
  const library = el("aside");
  library.setAttribute("aria-label", "Saved trips");
  for (const trip of data.trips) {
    const card = button(trip.title, () => select(trip.id));
    card.className = selectedId === trip.id ? "trip selected" : "trip";
    card.append(
      el(
        "small",
        `${trip.destination} · ${trip.days[0]?.date ?? "Dates to plan"}`,
      ),
    );
    library.append(card);
  }
  layout.append(library);
  const detail = el("article");
  const trip = data.trips.find((t) => t.id === selectedId);
  if (!trip) {
    detail.append(
      el("h2", "Choose your trip"),
      el(
        "p",
        selectedId
          ? "That trip was not found. Select one from your library."
          : "Each tray keeps its own selection. Pick a trip to see its timeline and budget.",
      ),
    );
  } else {
    detail.append(el("h2", trip.title), el("p", trip.destination));
    const actions = el("nav");
    actions.append(button("Continue planning", () => plan(trip)));
    actions.append(
      button("Open trip in library", async () => {
        const path = encodeURIComponent(
          `/trips?tripId=${encodeURIComponent(trip.id)}`,
        );
        const result = await app.openLink({
          url: `codex://plugins/${data.pluginRoute.split("@").map(encodeURIComponent).join("@")}/app/wayfinder.dashboard?path=${path}`,
        });
        if (result.isError)
          throw new Error("The host could not open the trip link.");
      }),
    );
    detail.append(actions);
    const total = trip.days.reduce(
      (sum, day) =>
        sum + day.stops.reduce((s, stop) => s + stop.estimatedCostUsd, 0),
      0,
    );
    const budget = el("section");
    budget.className = "budget";
    budget.append(
      el("h3", "Estimated stop budget"),
      el("strong", `${total.toFixed(2)} USD`),
    );
    if (fx?.currency === trip.currency)
      budget.append(
        el(
          "p",
          `${(total * fx.rate).toFixed(2)} ${fx.currency} · reference rate dated ${fx.date}`,
        ),
      );
    else
      budget.append(
        el(
          "p",
          trip.currency === "USD"
            ? "Costs are estimates, not reservations."
            : `Refresh to convert to ${trip.currency}.`,
        ),
      );
    budget.append(
      button("Refresh exchange rate", async () => {
        const result = await app.callServerTool({
          name: "wayfinder.exchange_rate",
          arguments: { currency: trip.currency },
        });
        resultError(result);
        fx = z
          .object({
            currency: z.string(),
            rate: z.number().positive(),
            date: z.string(),
          })
          .parse(result.structuredContent);
      }),
    );
    detail.append(budget);
    for (const day of [...trip.days].sort((a, b) =>
      a.date.localeCompare(b.date),
    )) {
      const section = el("section");
      section.append(el("h3", day.date));
      for (const stop of [...day.stops].sort((a, b) =>
        a.time.localeCompare(b.time),
      )) {
        const row = el("div");
        row.className = "stop";
        row.append(
          el("time", stop.time),
          el("strong", stop.name),
          el("span", `$${stop.estimatedCostUsd.toFixed(2)}`),
        );
        if (stop.notes) row.append(el("p", stop.notes));
        section.append(row);
      }
      detail.append(section);
    }
    const checks = el("section");
    checks.append(el("h3", "Before you go"));
    if (!trip.checklist.length)
      checks.append(
        el("p", "Ask Wayfinder to add packing or entry-requirement reminders."),
      );
    for (const item of trip.checklist)
      checks.append(el("p", `${item.done ? "✓" : "○"} ${item.label}`));
    detail.append(checks);
  }
  layout.append(detail);
  root.append(layout);
}
function hostContext(context: ReturnType<typeof app.getHostContext>) {
  if (!context) return;
  if (context.theme) applyDocumentTheme(context.theme);
  if (context.styles?.variables)
    applyHostStyleVariables(context.styles.variables);
  const link = context["openai/deepLink"] as { url?: string } | undefined;
  if (link?.url) {
    const id = new URL(link.url, "https://wayfinder.invalid").searchParams.get(
      "tripId",
    );
    if (id) selectedId = id;
  }
  render();
}
app.ontoolresult = (result) => {
  try {
    resultError(result);
    accept(result.structuredContent);
  } catch (e) {
    error = String(e);
    render();
  }
};
app.onhostcontextchanged = (context) => hostContext(context);
app.onteardown = async () => {
  clearInterval(timer);
  return {};
};
const timer = setInterval(() => {
  if (!document.hidden)
    void refresh().catch((e) => {
      error = String(e);
      render();
    });
}, 15000);
await app.connect();
connected = true;
hostContext(app.getHostContext());
