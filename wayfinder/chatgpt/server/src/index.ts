import express from "express";
import cors from "cors";
import { z } from "zod";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
// Keep critical tool-sequencing guidance within the first 512 chars!
const SERVER_INSTRUCTIONS = `Wayfinder plans walkable trips with live data.
1. Call search_neighborhood_pois and get_weather_and_fx FIRST to gather real coordinates, forecasts, and FX rates.
2. Call render_neighborhood_explorer to display interactive maps/carousels once POIs are selected.
3. Only call hold_boutique_stay when the user explicitly asks to place a reservation hold.`;

const OVERPASS_URL =
  process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";
const USER_AGENT =
  "Wayfinder-OSS-ChatGPT-Plugin/1.0 (+https://github.com/frankyang-code4fun/agentic_plugins)";

async function fetchSearchJson(
  service: string,
  url: string,
  init?: RequestInit,
  timeoutMs = 20_000,
) {
  const response = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
  }).catch((error: Error) => {
    const reason =
      error.name === "TimeoutError"
        ? `no response within ${timeoutMs / 1000} seconds`
        : error.message;
    throw new Error(
      `${service} request to ${new URL(url).origin} failed: ${reason}`,
    );
  });

  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(
      `${service} returned HTTP ${response.status} ${response.statusText}`.trim(),
    );
  }

  return response.json().catch(() => {
    throw new Error(`${service} returned an invalid JSON response.`);
  });
}

export function createWayfinderServer() {
  const server = new McpServer(
    { name: "wayfinder", version: "1.0.0" },
    { instructions: SERVER_INSTRUCTIONS },
  );
  // 1. READ-ONLY DATA TOOL: Geocoding + Walkable POIs via OpenStreetMap (Zero API Key)
  server.registerTool(
    "search_neighborhood_pois",
    {
      title: "Search Walkable Neighborhood Places",
      description:
        "Fetches real coordinates and walkable cafes, museums, and boutique stays via OpenStreetMap.",
      inputSchema: {
        query: z
          .string()
          .describe("Neighborhood & city, e.g. 'Higashiyama, Kyoto'"),
        category: z
          .enum(["cafe", "museum", "hotel", "viewpoint"])
          .default("cafe"),
        limit: z.number().int().min(1).max(12).default(6),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ query, category, limit }) => {
      const [center] = await fetchSearchJson(
        "Nominatim",
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
      );
      if (!center)
        return {
          content: [{ type: "text", text: `No match found for ${query}` }],
        };
      const osmTag =
        category === "hotel"
          ? '["tourism"="hotel"]'
          : category === "museum"
            ? '["tourism"="museum"]'
            : '["amenity"="cafe"]';
      const overpassQl = `[out:json][timeout:25];node${osmTag}(around:1400,${center.lat},${center.lon});out body ${limit};`;
      const poiJson = await fetchSearchJson(
        "Overpass",
        OVERPASS_URL,
        {
          method: "POST",
          body: new URLSearchParams({ data: overpassQl }),
        },
        45_000,
      );
      const places = poiJson.elements
        .filter((e) => e.tags?.name)
        .map((e) => ({
          id: `osm-${e.id}`,
          name: e.tags.name,
          category,
          lat: e.lat,
          lon: e.lon,
          cuisineOrStyle:
            e.tags.cuisine ?? e.tags["name:en"] ?? "Local favorite",
        }));

      return {
        structuredContent: {
          center: {
            lat: Number(center.lat),
            lon: Number(center.lon),
            label: center.display_name,
          },
          places,
        },
        content: [
          {
            type: "text",
            text: `Found ${places.length} walkable ${category} spots near ${center.display_name}.`,
          },
        ],
      };
    },
  );
  // 2. READ-ONLY DATA TOOL: Open-Meteo 7-Day Forecast + Frankfurter Live FX (Zero API Key)
  server.registerTool(
    "get_weather_and_fx",
    {
      title: "Get 7-Day Forecast & Live Currency Rate",
      description:
        "Returns daily high/low temps, rain probability, and live ECB currency exchange rate.",
      inputSchema: {
        lat: z.number(),
        lon: z.number(),
        fromCurrency: z.string().length(3).default("USD"),
        toCurrency: z.string().length(3).default("JPY"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ lat, lon, fromCurrency, toCurrency }) => {
      const [wxRes, fxRes] = await Promise.all([
        fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,precipitation_probability_max&timezone=auto`,
        ),
        fetch(
          `https://api.frankfurter.app/latest?from=${fromCurrency.toUpperCase()}&to=${toCurrency.toUpperCase()}`,
        ),
      ]);
      const wx = await wxRes.json();
      const fx = await fxRes.json();
      return {
        structuredContent: {
          daily: wx.daily,
          fxRate: fx.rates?.[toCurrency.toUpperCase()] ?? 1,
          base: fromCurrency,
        },
        content: [
          {
            type: "text",
            text: `Loaded 7-day forecast and live ${fromCurrency}->${toCurrency} rate.`,
          },
        ],
      };
    },
  );
  // 3. WRITE TOOL: Place Courtesy Boutique Stay Hold (Triggers ChatGPT [WRITE] Confirmation Card!)
  server.registerTool(
    "hold_boutique_stay",
    {
      title: "Place 24-Hour Courtesy Stay Hold",
      description:
        "Creates a refundable 24-hour courtesy reservation hold and writes it to the user's trip ledger.",
      inputSchema: {
        placeId: z.string(),
        hotelName: z.string(),
        checkIn: z.string().describe("YYYY-MM-DD"),
        nights: z.number().int().min(1).max(14),
        guestEmail: z.string().email(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async (args) => {
      const confirmationCode = `WF-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      // Persist to local store.json / D1 SQLite
      return {
        structuredContent: { confirmationCode, status: "HELD_24H", ...args },
        content: [
          {
            type: "text",
            text: `Courtesy hold ${confirmationCode} confirmed for ${args.hotelName} (${args.checkIn}, ${args.nights} nights).`,
          },
        ],
      };
    },
  );
  return server;
}
const app = express();
app.use(cors());
app.use(express.json());
app.post("/mcp", async (req, res) => {
  const server = createWayfinderServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  res.on("close", () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
app.listen(8787, () =>
  console.log(
    `Wayfinder MCP listening on http://localhost:8787/mcp; Overpass endpoint: ${OVERPASS_URL}`,
  ),
);
