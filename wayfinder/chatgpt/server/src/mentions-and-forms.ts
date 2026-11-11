import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listTrips } from "./trips.js";

const choiceSchema = z.object({
  roomType: z.enum(["machiya-garden", "river-loft"]),
  includeTeaBreakfast: z.boolean(),
});
const responseSchema = z.object({
  action: z.enum(["accept", "decline", "cancel"]),
  content: z.unknown().optional(),
});
function thumbnail(color: string, title: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><rect width="320" height="180" fill="${color}"/><rect x="28" y="25" width="90" height="70" rx="5" fill="#eaf4e3"/><path d="M73 25v70M28 60h90" stroke="#719580" stroke-width="4"/><rect x="145" y="80" width="145" height="55" rx="8" fill="#f8f1df"/><rect x="150" y="68" width="45" height="25" rx="5" fill="#ffffff"/><path d="M145 135v12m145-12v12" stroke="#302e29" stroke-width="5"/><text x="20" y="169" font-family="sans-serif" font-size="14" fill="#ffffff">${title} · illustration</text></svg>`;
  return {
    src: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
    mimeType: "image/svg+xml",
  };
}
export function registerMentionsAndForms(server: McpServer) {
  server.registerTool(
    "wayfinder.mentions",
    {
      title: "Search saved Wayfinder trips",
      description:
        "Search local saved trip titles, destinations, dates and IDs for composer mentions.",
      inputSchema: { query: z.string().max(500).default("") },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: { ui: { visibility: ["app"] } },
    },
    async ({ query }) => {
      const terms = query
        .trim()
        .toLocaleLowerCase()
        .split(/\s+/)
        .filter(Boolean);
      const items = (await listTrips())
        .filter((trip) => {
          const text = [
            trip.id,
            trip.title,
            trip.destination,
            ...trip.days.map((day) => day.date),
          ]
            .join(" ")
            .toLocaleLowerCase();
          return terms.every((term) => text.includes(term));
        })
        .slice(0, 30)
        .map((trip) => ({
          type: "resource_link" as const,
          uri: `wayfinder://trips/${trip.id}`,
          name: `${trip.title}${trip.days.length ? ` (${trip.days.map((d) => d.date).sort()[0]})` : ""}`,
          description: `${trip.destination} · ${trip.days.reduce((n, d) => n + d.stops.length, 0)} stops · ${trip.currency}`,
          mimeType: "application/json",
        }));
      return { structuredContent: { items }, content: [] };
    },
  );
  server.registerResource(
    "Saved Wayfinder trip",
    new ResourceTemplate("wayfinder://trips/{id}", { list: undefined }),
    { mimeType: "application/json" },
    async (uri, { id }) => {
      const trip = (await listTrips()).find((trip) => trip.id === id);
      if (!trip)
        throw new Error("Saved trip not found. It may have been removed.");
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(trip, null, 2),
          },
        ],
      };
    },
  );
  server.registerTool(
    "wayfinder.select_stay_style",
    {
      title: "Choose a demo stay style",
      description:
        "Ask the user to choose between two illustrated demo room styles and breakfast using a form. This is a UI demonstration: no live inventory, prices, booking, hold or payment. Call when the user asks to test the room picker or choose a stay style.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async () => {
      const capabilities = server.server.getClientCapabilities();
      const extensions = (capabilities as Record<string, unknown> | undefined)
        ?.extensions as Record<string, { form?: unknown }> | undefined;
      const experimental = capabilities?.experimental as
        | Record<string, { form?: unknown }>
        | undefined;
      const extended = !!(
        extensions?.["openai/elicitation"]?.form ||
        experimental?.["openai/elicitation"]?.form
      );
      if (!extended && !capabilities?.elicitation?.form) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: "This session does not advertise form support. Ask the user in chat: garden machiya or river loft, and tea breakfast yes/no. No choice has been made or saved.",
            },
          ],
        };
      }
      const options = [
        {
          const: "machiya-garden",
          title: "Garden machiya — demo",
          ...(extended
            ? { "x-openai-thumbnail": thumbnail("#3a6957", "Garden machiya") }
            : {}),
        },
        {
          const: "river-loft",
          title: "River loft — demo",
          ...(extended
            ? { "x-openai-thumbnail": thumbnail("#426b85", "River loft") }
            : {}),
        },
      ];
      const params = {
        mode: "form" as const,
        message:
          "Choose a demo Kyoto stay style. Illustrations only; no availability, reservation or payment. Include tea breakfast?",
        requestedSchema: {
          type: "object" as const,
          properties: {
            roomType: {
              type: "string" as const,
              title: "Stay style (demo)",
              oneOf: options,
            },
            includeTeaBreakfast: {
              type: "boolean" as const,
              title: "Include tea breakfast?",
              default: true,
            },
          },
          required: ["roomType", "includeTeaBreakfast"],
        },
      };
      const result = extended
        ? await server.server.request(
            { method: "openai/elicitation/create", params },
            responseSchema,
          )
        : await server.server.elicitInput(params);
      if (result.action !== "accept")
        return {
          structuredContent: { status: result.action, demo: true },
          content: [
            {
              type: "text" as const,
              text: "Room selection cancelled or declined. Nothing booked or saved.",
            },
          ],
        };
      const selected = choiceSchema.safeParse(result.content);
      if (!selected.success)
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: "The host returned an invalid room choice. Nothing booked or saved.",
            },
          ],
        };
      return {
        structuredContent: { status: "accepted", demo: true, ...selected.data },
        content: [
          {
            type: "text" as const,
            text: `Demo preference: ${selected.data.roomType}; tea breakfast: ${selected.data.includeTeaBreakfast ? "yes" : "no"}. Nothing booked or saved.`,
          },
        ],
      };
    },
  );
}
