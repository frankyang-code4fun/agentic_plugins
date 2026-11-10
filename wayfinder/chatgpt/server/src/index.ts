import express from "express";
import cors from "cors";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createWayfinderServer } from "./server.js";
export { createWayfinderServer } from "./server.js";
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
    `Wayfinder MCP listening on http://localhost:8787/mcp; Overpass endpoint: ${process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter"}`,
  ),
);
