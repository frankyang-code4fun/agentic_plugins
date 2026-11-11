import { readFile } from "node:fs/promises";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { listTrips, saveTrip, tripSchema } from "./trips.js";

export function registerWorkspaceEntrypoints(server: McpServer) {
  for (const [mode, type, title] of [
    ["dashboard", "global", "Wayfinder Trip Library"],
    ["itinerary_tray", "thread", "Wayfinder Itinerary & Budget"],
  ] as const) {
    const uri = `ui://wayfinder/${mode}-v1.html`;
    registerAppResource(
      server,
      title,
      uri,
      { mimeType: RESOURCE_MIME_TYPE },
      async () => ({
        contents: [
          {
            uri,
            mimeType: RESOURCE_MIME_TYPE,
            text: await readFile(
              new URL("../../web/dist/workspace.html", import.meta.url),
              "utf8",
            ),
            _meta: {
              ui: { csp: { connectDomains: [], resourceDomains: [] } },
              "openai/ui": {
                availableDisplayModes: ["inline", "fullscreen"],
                preferredDisplayMode: "fullscreen",
              },
            },
          },
        ],
      }),
    );
    registerAppTool(
      server,
      `wayfinder.${mode}`,
      {
        title,
        description:
          mode === "dashboard"
            ? "Open the saved trip library. Optionally select a trip by ID."
            : "Open the itinerary and budget tray. Select a saved trip explicitly; no trip is inferred from other chats.",
        inputSchema: { tripId: z.string().optional() },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
        _meta: {
          ui: { resourceUri: uri, visibility: ["app", "model"] },
          "openai/ui": { entrypoints: [{ type }] },
        },
      },
      async ({ tripId }) => ({
        structuredContent: {
          mode,
          trips: await listTrips(),
          activeTripId: tripId ?? null,
        },
        content: [{ type: "text", text: `Opened ${title}.` }],
      }),
    );
  }
  server.registerTool(
    "wayfinder.save_trip",
    {
      title: "Save a Wayfinder trip",
      description:
        "Save a complete itinerary and checklist locally, replacing the trip with the same ID. Only save when requested. Costs are estimates in USD. Use the saved ID to open wayfinder.dashboard or wayfinder.itinerary_tray.",
      inputSchema: { trip: tripSchema },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ trip }) => ({
      structuredContent: { trip: await saveTrip(trip) },
      content: [{ type: "text", text: `Saved trip ${trip.id}.` }],
    }),
  );
  server.registerTool(
    "wayfinder.exchange_rate",
    {
      title: "Refresh trip exchange rate",
      description:
        "Get the latest available daily reference exchange rate from USD for the itinerary budget. Not a live trading quote.",
      inputSchema: { currency: z.string().regex(/^[A-Z]{3}$/) },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ currency }) => {
      try {
        let result = {
          currency,
          rate: 1,
          date: new Date().toISOString().slice(0, 10),
        };
        if (currency !== "USD") {
          const response = await fetch(
            `https://api.frankfurter.app/latest?from=USD&to=${currency}`,
            { signal: AbortSignal.timeout(10000) },
          );
          if (!response.ok)
            throw new Error(
              `Exchange-rate service returned HTTP ${response.status}`,
            );
          const data = z
            .object({
              date: z.iso.date(),
              rates: z.record(z.string(), z.number().positive()),
            })
            .parse(await response.json());
          if (!data.rates[currency])
            throw new Error(`No rate available for ${currency}`);
          result = { currency, rate: data.rates[currency], date: data.date };
        }
        return {
          structuredContent: result,
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text:
                error instanceof Error
                  ? error.message
                  : "Exchange rate unavailable",
            },
          ],
        };
      }
    },
  );
}
