import fs from "node:fs";
import { z } from "zod";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
const EXPLORE_URI = "ui://wayfinder/explore-v1.html"; // Version URI when breaking schema!
export function registerExploreUi(server: any) {
  registerAppResource(
    server,
    "Wayfinder Neighborhood Map & Carousel",
    EXPLORE_URI,
    {
      mimeType: RESOURCE_MIME_TYPE,
      description:
        "Interactive walkable POI carousel and fullscreen Leaflet map.",
    },
    async () => ({
      contents: [
        {
          uri: EXPLORE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: fs.readFileSync(
            new URL("../../web/dist/explore.html", import.meta.url),
            "utf-8",
          ),
          _meta: {
            ui: {
              prefersBorder: true,
              csp: {
                connectDomains: [
                  "https://api.open-meteo.com",
                  "https://api.frankfurter.app",
                ],
                resourceDomains: [
                  "https://tile.openstreetmap.org",
                  "https://upload.wikimedia.org",
                  "https://unpkg.com",
                ],
              },
            },
            "openai/ui": {
              availableDisplayModes: ["inline", "fullscreen"],
              preferredDisplayMode: "inline",
            },
          },
        },
      ],
    }),
  );
  // Dedicated RENDER tool called AFTER data tools gather POIs

  registerAppTool(
    server,
    "render_neighborhood_explorer",
    {
      title: "Render Interactive Neighborhood Map & Carousel",
      description:
        "Displays walkable POIs as an inline photo carousel that expands into a fullscreen OpenStreetMap.",
      inputSchema: {
        neighborhoodTitle: z.string(),
        center: z.object({ lat: z.number(), lon: z.number() }),
        currency: z.string().default("USD"),
        places: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            category: z.string(),
            lat: z.number(),
            lon: z.number(),
            estCostUsd: z.number().default(18),
            photoUrl: z.string().optional(),
          }),
        ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: { ui: { resourceUri: EXPLORE_URI } },
    },
    async (args) => ({
      structuredContent: args,
      content: [
        {
          type: "text",
          text: `Rendered interactive map for ${args.neighborhoodTitle}
(${args.places.length} stops).`,
        },
      ],
    }),
  );
}
