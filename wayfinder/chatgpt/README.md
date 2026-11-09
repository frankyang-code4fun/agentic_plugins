# Wayfinder development in ChatGPT desktop

Run the MCP server locally, expose it through Cloudflare, and connect the installed
Wayfinder plugin to the public HTTPS endpoint. Local source changes and installed
plugin releases have separate update steps.

## Prerequisites

- Node.js and npm. Development has been tested with Node.js 22.23.4.
- `cloudflared` installed and available on your PATH.
- Access to the private Wayfinder plugin and Plugin Creator for updating its release.

Check the installed commands with `node --version`, `npm --version`, and
`cloudflared --version`. For Ubuntu installation instructions, see
[Cloudflare packages](https://pkg.cloudflare.com/).

## 1. Run the MCP server

In terminal 1, starting from the repository root:

```bash
cd wayfinder/chatgpt/server
npm ci
npx tsx watch src/index.ts
```

The server listens on `http://localhost:8787/mcp`. Keep this terminal open.
`tsx watch` restarts the process after source changes.

To explicitly select the default Overpass endpoint:

```bash
OVERPASS_URL=https://overpass-api.de/api/interpreter npx tsx watch src/index.ts
```

## 2. Test with MCP Inspector

In terminal 2:

```bash
npx @modelcontextprotocol/inspector@latest http://localhost:8787/mcp
```

Open the Inspector URL printed in the terminal. If connection settings are needed,
select Streamable HTTP and enter `http://localhost:8787/mcp`.
Confirm these tools appear:

- `search_neighborhood_pois`
- `get_weather_and_fx`
- `hold_boutique_stay`

Start with `search_neighborhood_pois` using these arguments:

```json
{
  "query": "Higashiyama, Kyoto",
  "category": "cafe",
  "limit": 5
}
```

In the form editor, enter the query without surrounding quotation marks.
Public Overpass servers can respond slowly. Wayfinder allows up to 45 seconds
for the Overpass request and reports upstream errors. The result limit is an
upper bound; filtering unnamed places can produce fewer results.

## 3. Start the Cloudflare tunnel

In another terminal:

```bash
cloudflared tunnel --url http://localhost:8787
```

Wait for `Registered tunnel connection`. Copy the generated
`https://<random-name>.trycloudflare.com` address and append `/mcp`.
That complete URL is the public MCP endpoint.

Keep the tunnel running while testing. Restarting the MCP server preserves the
URL while the tunnel process stays running. Starting a new quick tunnel generates
a new URL, which must also be updated in the installed plugin. A named tunnel
with a configured domain provides a stable hostname.

The current server uses no authentication. The tunnel exposes its tools to
clients that can reach the public URL.

## 4. Update the local plugin connection

In `plugins/wayfinder/mcp.json`, set
`mcpServers.wayfinder.url` to the complete public endpoint from step 3.
Keep the transport as `streamable-http` and the existing authentication type as
`none` for this development server.

In `plugins/wayfinder/plugin.json`, the connection reference is:

```json
"mcpServers": "./mcp.json"
```

Increment the package version when preparing a new package release.
Editing these local files or pushing them to GitHub does not automatically update
the private account plugin installed in ChatGPT.

## 5. Update the installed Wayfinder plugin

The existing Wayfinder account plugin can be updated through Plugin Creator in
a chat that has that plugin available. Request an update to the existing plugin,
for example:

> Update my installed Wayfinder plugin with the MCP connection from
> /home/yxyzr/agentic_plugins/wayfinder/chatgpt/plugins/wayfinder/mcp.json.
> Preserve its existing skills, icons, metadata, and private visibility.

The update workflow is:

1. Read the existing plugin's current release and verify its identity.
2. Add the local `mcp.json` to that package.
3. Add the MCP reference to the installed `plugin.json` and increment its version.
   Synchronize the version in any compatibility manifest.
4. Upload the changed files as an update to the same plugin, using its current
   release ID to guard against concurrent edits.
5. Read back the saved release and verify the endpoint and preserved components.

The local and installed manifests currently have different metadata and version
histories. Base this connection-only update on the installed manifest. Its existing
skills and compass artwork are already packaged. The local package still references
missing `icon.png` and `logo.png` assets and contains an empty
`packing-weather-audit/SKILL.md`; those need completion before uploading the full
local package.

For later skill changes, explicitly request that the corresponding local skill
files be included in the installed plugin update.

## 6. Test in ChatGPT desktop

Open the updated plugin link returned by Plugin Creator. Start a new chat, type
`@`, and select **Wayfinder** from the picker. Keep both the server and tunnel
running, then send:

> @Wayfinder Find 5 walkable cafés in Higashiyama, Kyoto using your search tool.

Inspect the tool call and its results. Then test the combined read workflow:

> @Wayfinder Find 5 walkable cafés in Higashiyama, Kyoto, then check the next
> 7 days' rain forecast and the current USD-to-JPY exchange rate using your tools.

The weather tool returns a rolling forecast. Use explicit dates when testing
date-sensitive prompts and check the dates returned by the service.

## What to refresh after a change

| Change | Development action |
| --- | --- |
| Server implementation | Let `tsx watch` restart it, test in Inspector, then call it in ChatGPT. |
| Tool names, schemas, descriptions, or annotations | Restart the server and refresh discovered tool metadata in the connection UI where available, then test in a new chat. |
| Packaged skills, manifest, or assets | Upload an updated release of the existing plugin, then test in a new chat. |
| Quick-tunnel URL | Update local `mcp.json` and the installed plugin connection. |

For a custom MCP server added directly through ChatGPT Plugins, the documented
metadata update action is **Refresh** on its connection. Imported package files
use the plugin release workflow. See
[OpenAI's connection and testing guide](https://developers.openai.com/plugins/deploy/connect-chatgpt).

## Current reservation-tool limitation

`hold_boutique_stay` currently generates a random confirmation code and echoes
the request. It has no hotel reservation integration or persistent hold storage.
Treat its response as a demo. A real hold requires implementing the reservation
backend, including expiry and persistence. Its current inputs also require
`nights` and `guestEmail`.

Hotel search currently returns general hotel nodes without boutique classification
or distance sorting. A request for the closest boutique hotel needs additional
implementation and verification.
