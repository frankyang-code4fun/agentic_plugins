import { App } from "@modelcontextprotocol/ext-apps";
import L from "leaflet";
import { z } from "zod";
import "leaflet/dist/leaflet.css";
import "./style.css";

const placeSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  estCostUsd: z.number().nonnegative().optional(),
  photoUrl: z.string().url().optional(),
});
const resultSchema = z.object({
  neighborhoodTitle: z.string(),
  center: z.object({ lat: z.number(), lon: z.number() }),
  currency: z.enum(["USD", "EUR", "JPY"]).default("USD"),
  places: z.array(placeSchema),
});
type Place = z.infer<typeof placeSchema>;
const app = new App({ name: "Wayfinder Explorer", version: "1.0.0" });
const root = document.querySelector<HTMLElement>("#app")!;
let map: L.Map | undefined;
let generation = 0;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = "") {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

app.ontoolresult = (result) => {
  const current = ++generation;
  map?.remove();
  map = undefined;
  root.replaceChildren();
  if (result.isError) {
    root.append(element("h2", "Unable to show neighborhood"));
    const messages = result.content
      ?.filter((item) => item.type === "text")
      .map((item) => item.text);
    root.append(
      element("p", messages?.join("\n") || "The tool returned an error."),
    );
    return;
  }
  const parsed = resultSchema.safeParse(result.structuredContent);
  if (!parsed.success) {
    root.append(element("h2", "Neighborhood data is missing"));
    root.append(
      element(
        "p",
        "Supply neighborhoodTitle, center, and places in the tool input.",
      ),
    );
    return;
  }
  const data = parsed.data;
  const header = element("header");
  const title = element("div");
  title.append(
    element("h1", data.neighborhoodTitle),
    element("p", `${data.places.length} places · Select a card or map pin`),
  );
  const controls = element("div");
  const currency = element("select");
  currency.setAttribute("aria-label", "Display currency");
  for (const code of ["USD", "EUR", "JPY"]) {
    const option = element("option", code);
    option.value = code;
    currency.append(option);
  }
  currency.value = data.currency;
  const expand = element("button", "Expand map");
  controls.append(currency, expand);
  header.append(title, controls);
  const status = element("p");
  status.setAttribute("role", "status");
  const canvas = element("div");
  canvas.id = "map";
  const cards = element("div");
  cards.className = "cards";
  root.append(header, status, canvas, cards);
  const activeMap = L.map(canvas).setView(
    [data.center.lat, data.center.lon],
    15,
  );
  map = activeMap;
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
    .on("tileerror", () => {
      status.textContent =
        "Map tiles are unavailable. You can still select the place cards.";
    })
    .addTo(activeMap);
  const prices: { node: HTMLElement; usd: number }[] = [];
  const buttons: HTMLButtonElement[] = [];
  async function select(place: Place, button: HTMLButtonElement) {
    buttons.forEach((item) =>
      item.setAttribute("aria-pressed", String(item === button)),
    );
    activeMap.panTo([place.lat, place.lon]);
    try {
      await app.updateModelContext({
        content: [
          {
            type: "text",
            text: `Selected Wayfinder place: ${place.name} (${place.category}), ID=${place.id}, coordinates=${place.lat},${place.lon}`,
          },
        ],
      });
      if (current === generation)
        status.textContent = `Selected ${place.name}. Shared with the conversation.`;
    } catch {
      if (current === generation)
        status.textContent =
          "Could not share this selection with the conversation.";
    }
  }
  for (const place of data.places) {
    const button = element("button");
    button.className = "card";
    button.setAttribute("aria-pressed", "false");
    if (place.photoUrl?.startsWith("https://")) {
      const photo = element("img");
      photo.src = place.photoUrl;
      photo.alt = "";
      photo.loading = "lazy";
      photo.onerror = () => photo.remove();
      button.append(photo);
    }
    button.append(
      element("strong", place.name),
      element("span", place.category),
    );
    if (place.estCostUsd !== undefined) {
      const price = element("span");
      prices.push({ node: price, usd: place.estCostUsd });
      button.append(price);
    }
    button.onclick = () => void select(place, button);
    buttons.push(button);
    cards.append(button);
    const label = element("span", place.name);
    L.circleMarker([place.lat, place.lon], {
      radius: 8,
      color: "#0f766e",
      fillOpacity: 0.85,
    })
      .bindTooltip(label)
      .on("click", () => void select(place, button))
      .addTo(activeMap);
  }
  if (data.places.length) {
    activeMap.fitBounds(
      L.latLngBounds(data.places.map((place) => [place.lat, place.lon])),
      { padding: [24, 24], maxZoom: 16 },
    );
  } else {
    cards.append(
      element(
        "p",
        "No places supplied. Run the search tool and copy its places into this render call.",
      ),
    );
  }
  function updatePrices(rate: number, code: string) {
    const formatter = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
    });
    prices.forEach(({ node, usd }) => {
      node.textContent = `Estimated ${formatter.format(usd * rate)}`;
    });
  }
  async function convert() {
    const code = currency.value;
    currency.disabled = true;
    try {
      let rate = 1;
      if (code !== "USD") {
        const result = await app.callServerTool({
          name: "get_weather_and_fx",
          arguments: { ...data.center, fromCurrency: "USD", toCurrency: code },
        });
        if (result.isError) throw new Error("Currency request failed");
        rate = z
          .object({ fxRate: z.number().positive() })
          .parse(result.structuredContent).fxRate;
      }
      if (current !== generation) return;
      updatePrices(rate, code);
      status.textContent = "";
    } catch {
      if (current !== generation) return;
      currency.value = "USD";
      updatePrices(1, "USD");
      status.textContent =
        "Currency conversion unavailable. Estimates are shown in USD.";
    } finally {
      currency.disabled = false;
    }
  }
  currency.onchange = () => void convert();
  updatePrices(1, "USD");
  if (data.currency !== "USD") void convert();
  expand.onclick = async () => {
    try {
      const result = await app.requestDisplayMode({ mode: "fullscreen" });
      if (current === generation) {
        status.textContent =
          result.mode === "fullscreen"
            ? ""
            : "Fullscreen is unavailable in this host.";
        activeMap.invalidateSize();
      }
    } catch {
      status.textContent = "Fullscreen is unavailable in this host.";
    }
  };
  const observer = new ResizeObserver(() => activeMap.invalidateSize());
  observer.observe(canvas);
  activeMap.on("unload", () => observer.disconnect());
};

app.connect().catch(() => {
  root.replaceChildren(
    element("h2", "Open this explorer in an MCP Apps host"),
    element("p", "The widget could not connect to its host."),
  );
});
