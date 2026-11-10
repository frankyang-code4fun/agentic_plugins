import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createWayfinderServer } from "./server.js";

await createWayfinderServer().connect(new StdioServerTransport());
console.error("Wayfinder MCP connected over stdio");
