import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const preferences = z
  .object({
    homeAirport: z.string().regex(/^$|^[A-Z]{3}$/),
    baseCurrency: z.enum(["USD", "CAD", "EUR", "GBP", "JPY"]),
    walkingPace: z.enum(["relaxed", "moderate", "brisk"]),
    dietaryNotes: z.string().max(1000),
  })
  .strict();
export const defaults = {
  homeAirport: "",
  baseCurrency: "USD",
  walkingPace: "moderate",
  dietaryNotes: "",
} as const;
const directory = () =>
  process.env.WAYFINDER_SETTINGS_DIR ||
  join(
    process.env.XDG_DATA_HOME || join(homedir(), ".local/share"),
    "wayfinder",
  );
export async function readPreferences() {
  try {
    return preferences.parse(
      JSON.parse(await readFile(join(directory(), "settings.json"), "utf8")),
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { ...defaults };
    throw e;
  }
}
async function updatePreferences(patch: Partial<z.infer<typeof preferences>>) {
  await mkdir(directory(), { recursive: true, mode: 0o700 });
  const lock = join(directory(), "settings.lock");
  let locked = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      await mkdir(lock);
      locked = true;
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  if (!locked)
    throw new Error(
      "Preferences are busy. Retry shortly. If a server crashed, remove the stale settings.lock directory after stopping it.",
    );
  const temporary = join(directory(), `.settings-${randomUUID()}.tmp`);
  try {
    const values = preferences.parse({
      ...(await readPreferences()),
      ...patch,
    });
    await writeFile(temporary, JSON.stringify(values, null, 2) + "\n", {
      mode: 0o600,
    });
    await rename(temporary, join(directory(), "settings.json"));
    return values;
  } finally {
    await rm(temporary, { force: true });
    await rm(lock, { recursive: true, force: true });
  }
}
const schema = {
  type: "object",
  properties: {
    homeAirport: {
      type: "string",
      title: "Home airport (IATA)",
      description: "Three uppercase letters, or leave blank.",
      pattern: "^$|^[A-Z]{3}$",
    },
    baseCurrency: {
      type: "string",
      title: "Budget currency",
      enum: ["USD", "CAD", "EUR", "GBP", "JPY"],
    },
    walkingPace: {
      type: "string",
      title: "Walking pace",
      enum: ["relaxed", "moderate", "brisk"],
    },
    dietaryNotes: {
      type: "string",
      title: "Dietary preferences",
      description: "Preferences only; confirm allergens with each venue.",
      maxLength: 1000,
    },
  },
};
const layout = [
  {
    kind: "group",
    title: "Traveler defaults",
    items: Object.keys(defaults).map((property) => ({
      kind: "property",
      property,
    })),
  },
];
export function registerSettings(server: McpServer) {
  server.registerTool(
    "settings.read",
    {
      title: "Read traveler preferences",
      description:
        "Read persisted local traveler defaults before planning. Explicit instructions for this trip override defaults.",
      inputSchema: {},
      outputSchema: {
        schema: z.object({
          type: z.literal("object"),
          properties: z.record(z.string(), z.unknown()),
        }),
        values: preferences,
        layout: z.array(
          z.object({
            kind: z.literal("group"),
            title: z.string(),
            items: z.array(
              z.object({ kind: z.literal("property"), property: z.string() }),
            ),
          }),
        ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: { ui: { visibility: ["app", "model"] } },
    },
    async () => ({
      structuredContent: { schema, values: await readPreferences(), layout },
      content: [],
    }),
  );
  server.registerTool(
    "settings.update",
    {
      title: "Save traveler preferences",
      description:
        "Persist only preferences the user asks to save. Supply set with changed fields. To reset, set homeAirport/dietaryNotes to empty, baseCurrency to USD, or walkingPace to moderate.",
      inputSchema: {
        set: preferences
          .partial()
          .refine(
            (value) => Object.keys(value).length > 0,
            "Provide at least one setting",
          ),
      },
      outputSchema: { values: preferences },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: { ui: { visibility: ["app", "model"] } },
    },
    async ({ set }) => ({
      structuredContent: { values: await updatePreferences(set) },
      content: [
        { type: "text", text: "Saved traveler preferences on this computer." },
      ],
    }),
  );
}
