import { readFile } from "node:fs/promises";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
export function registerFileEditor(server: McpServer) {
  const uri = "ui://wayfinder/file-editor-v1.html";
  registerAppResource(
    server,
    "Wayfinder Travel File Editor",
    uri,
    { mimeType: RESOURCE_MIME_TYPE },
    async () => ({
      contents: [
        {
          uri,
          mimeType: RESOURCE_MIME_TYPE,
          text: await readFile(
            new URL("../../web/dist/file-editor.html", import.meta.url),
            "utf8",
          ),
          _meta: {
            ui: { csp: { connectDomains: [], resourceDomains: [] } },
            "openai/ui": {
              availableDisplayModes: ["fullscreen"],
              preferredDisplayMode: "fullscreen",
            },
          },
        },
      ],
    }),
  );
  registerAppTool(
    server,
    "wayfinder.open_file",
    {
      title: "Wayfinder Travel File Editor",
      description:
        "View and edit an attached .trip itinerary, .ics calendar or .gpx route. Open from a file attachment; access and saving are handled by the host.",
      inputSchema: {
        file: z.object({
          name: z
            .string()
            .min(1)
            .regex(/\.(trip|ics|gpx)$/i),
          resourceUri: z.string().trim().min(1),
        }),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: {
        ui: { resourceUri: uri, visibility: ["app"] },
        "openai/ui": {
          entrypoints: [
            { type: "file", extensions: [".trip", ".ics", ".gpx"] },
          ],
        },
      },
    },
    async ({ file }) => ({
      structuredContent: { file },
      content: [{ type: "text", text: `Opened ${file.name}.` }],
    }),
  );
}
