# Wayfinder development in ChatGPT desktop

## Desktop-local stdio workflow

The plugin now defaults to a local stdio MCP process. ChatGPT desktop launches
`node ${PLUGIN_ROOT}/server/dist/stdio.mjs` when connecting to the plugin in a
local chat. Node.js 22 must be available on the desktop host's PATH.

To rebuild the packaged server and explorer after source changes, run:

```bash
cd wayfinder/chatgpt/web
npm ci
cd ../server
npm ci
npm run build:plugin
```

Include `server/dist/stdio.mjs` and `web/dist/explore.html` from the plugin folder
when updating the installed release, alongside its stdio `mcp.json` and updated
manifest. These generated files are ignored by Git and must be rebuilt before
packaging. Set `extensions.com.openai.requires_local_executor` to `true`.

For direct protocol testing, use `npm run stdio` in the server folder with an
MCP stdio client. The desktop host owns the installed server process. Start a new
local chat after installing an update so the host can connect to the new release.

The following HTTP and Cloudflare workflow remains available for remote testing.
Switching back to remote transport requires an HTTP entry in the plugin's MCP
configuration.

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

## Section 6: trip library and itinerary tray

The local plugin provides `wayfinder.dashboard` (global navigation) and
`wayfinder.itinerary_tray` (a content tab in a local Work conversation). Both
accept `{}`. Select a saved trip in either view; a tray does not infer a trip from
another conversation. Open it with `{ "tripId": "kyoto-test" }` to select a trip
explicitly. While visible, the views refresh saved data every 15 seconds.

Use `wayfinder.save_trip` to persist a full itinerary (same ID replaces that trip).
Trips are stored under `$XDG_DATA_HOME/wayfinder/trips`, falling back to
`~/.local/share/wayfinder/trips`, outside the installed plugin directory.
`WAYFINDER_DATA_DIR` overrides the directory for testing. Checklist changes are
made through the save tool. Budget amounts are estimated USD costs; the exchange
button requests the latest daily reference rate and displays its date. It does
not claim a live trading quote or silently substitute a rate when unavailable.

After updating the installed plugin, start a **local Work** chat and try:

> @Wayfinder Save a test trip with ID kyoto-test, title Kyoto test, destination
> Kyoto, and display currency JPY. For 2026-11-18, add Gojo Cafe at 09:00 with an
> estimated USD cost of 10, and a neighborhood walk at 10:00 costing USD 0.
> Add an unchecked “Pack umbrella” reminder. Open wayfinder.itinerary_tray for
> kyoto-test. These are test estimates; no live place search is needed.

Expect two stops, a USD 10 total, and the reminder. Select Refresh exchange rate
to see the JPY estimate and rate date. Open Trip Library from global navigation,
select the saved trip, and try Continue planning. Reopen the library to verify
persistence. Each tray requires its own selection. No server command or tunnel
is needed for the installed stdio plugin.

The desktop deep link uses the installed account plugin ID and an encoded
app-relative path (not the guide's old top-level `tripId` query parameter):

```text
codex://plugins/plugins_6aefb5a47e94819194d85b9b9e98899d/app/wayfinder.dashboard?path=%2Ftrips%3FtripId%3Dkyoto-test
```

Protocol regression check (after `npm run build:plugin`):

```bash
cd wayfinder/chatgpt/server
node test/workspace.mjs
```

This uses temporary trip storage and checks both empty-input entrypoints,
resource bundling, persistence across process restarts, isolated tray selection,
input validation, and USD conversion.

## Section 7: travel file viewer/editor

`wayfinder.open_file` registers `.trip`, `.ics`, and `.gpx` file entrypoints.
Open a file attachment or workspace file in a **local Work** chat with Wayfinder
installed. The host supplies the file's opaque resource URI. Do not invent a URI
or call the tool with an arbitrary filesystem path. No server or tunnel launch
is required for the installed plugin.

Use copies of `examples/kyoto-test.trip`, `examples/kyoto-test.ics`, and
`examples/kyoto-test.gpx` for testing. These are illustrative data, not bookings
or a verified route.

1. Start a new local Work chat after the plugin update. Attach the examples folder
   as local context (or copies of its files) and ask ChatGPT to show clickable
   references to those three files. Click one and select Wayfinder if a viewer
   chooser appears.
2. In `.trip`, change the cafe time from 09:00 to 09:30 and its estimated cost to
   12. Click **Save to file**, then **Reload from file** to verify the edit.
3. In `.ics`, change the event title; retain the displayed start/end format.
   Save and reopen. The Asia/Tokyo time-zone parameter remains in the file.
4. In `.gpx`, inspect the elevation profile and change a point's elevation.
   Save/reload and verify the new elevation. The horizontal axis is point order,
   not route distance. Existing route/track segments and XML extensions remain.
5. For a conflict test, edit a field without saving, then change the same file
   externally in a text editor. Click **Save to file**. The editor must report a
   conflict and retain your draft. Copy edited source before confirming a reload.

Read-only attachments have disabled fields and Save. The editor requires both
`writable: true` and a nonempty ETag from the host; use an authorized local file
for save-back testing. Failed/conflicting saves are never reported as success.

The editor supports the section-6 `.trip` schema (`title`, `days[].date`, and
`days[].stops[]` with `time`, `name`, `estimatedCostUsd`, optional `notes`). It edits
existing rows via fields. For `.trip`, drag a stop onto another stop in the same
day to swap their time slots. Adding/deleting events is not provided. Calendar recurrence rules are preserved rather than expanded;
editing a recurring event changes its definition. GPX is edited as points with
an elevation preview, not as a street map. Files above 2 MB are rejected. JSON,
ICS and XML serialization can normalize whitespace while retaining other data.
These files remain separate from the section-6 saved-trip library.

Verification commands from `wayfinder/chatgpt`:

```bash
cd web
../server/node_modules/.bin/tsx --test test/travel-formats.test.ts
node --test test/file-editor-host.test.mjs
npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution bundler --lib ES2022,DOM --skipLibCheck src/*.ts
cd ../server
npm run build:plugin
node test/workspace.mjs
```

## Section 8: saved-trip mentions and choice forms

The server advertises `extensions["openai/mentions"].searchTool` as
`wayfinder.mentions`. Search matches trip ID, title, destination and dates,
case-insensitively; an empty query lists up to 30 trips. Results link to readable
`wayfinder://trips/{id}` JSON resources, so a selected mention supplies the saved
itinerary rather than just a label. Only section-6 saved trips appear; standalone
`.trip` files from section 7 are not automatically imported.

Start a new **local Work** chat after updating the plugin. First save a trip with
`wayfinder.save_trip` if the library is empty. Type `@Wayfinder`, select the plugin,
and search for `kyoto` in its item picker. Pick the saved trip and ask:

> Summarize this saved trip's stops and estimated USD cost. Do not change it.

For the visual form, mention Wayfinder and send:

> Call wayfinder.select_stay_style so I can test the illustrated room-style
> picker and breakfast option. Do not make a booking.

Choose a room and toggle breakfast, then submit. The response should reflect
both choices. Repeat and cancel: no preference should be recorded. The room
cards are demo illustrations, not hotel photos, inventory or quotations. This
tool returns the selection without writing a trip, placing a hold or charging.

For this SDK's older MCP protocol, extended-form hosts receive
`openai/elicitation/create` with icon-object thumbnails. Standard-form-only hosts
receive `elicitation/create` without thumbnails. Hosts that advertise neither
receive an explicit unsupported-form result with a suggested chat fallback.
Host rendering and the picker location can vary by desktop build.

Regression test, from `server` after `npm run build:plugin`:

```bash
node test/mentions-and-forms.mjs
```

The test uses temporary trip storage and mock MCP clients, covering discovery,
empty/case-insensitive/no-match searches, reading linked trips, accepted and
cancelled forms, invalid responses, and hosts with differing form support.

## Sections 9–11: settings, skills and GitHub installation

Open the installed Wayfinder plugin details to find native traveler defaults:
home airport, USD/CAD/EUR/GBP/JPY budget currency, relaxed/moderate/brisk pace,
and dietary notes. The settings tools use the current `openai/settings` contract,
including output schemas and group/property layout. `settings.update` accepts a
nonempty `set` object; changing one field preserves the others. Reset by setting
the documented default (blank airport/notes, USD, moderate). Settings persist in
`~/.local/share/wayfinder/settings.json` (XDG_DATA_HOME respected), or
`WAYFINDER_SETTINGS_DIR/settings.json` for isolated tests. Writes use an atomic
rename and a lock to serialize concurrent updates.

Onboarding runs the packaged setup skill. Existing users can invoke Wayfinder
and ask “Set my defaults to YYZ, CAD, relaxed walking, vegetarian.” Start another
local chat and ask it to read your defaults to verify persistence. Native UI and
first-install onboarding still require testing in the actual desktop host.

Skill checks to run in separate local chats:

| Prompt | Expected behavior |
| --- | --- |
| Plan a walkable three-day Kyoto itinerary | Read settings, clarify missing dates/constraints, gather data, render map and daily table |
| I have 48 hours in Lisbon and hate steep hills | Activate planning skill without naming it; account for hills and mobility |
| Audit my saved Kyoto trip for rain alternatives | Preserve the itinerary and propose nearby swaps; save only if requested |
| What is the USD to JPY rate? | Use the FX tool directly, without a multi-day planning workflow |

Skills guide behavior; these model-driven checks are manual acceptance tests,
not guaranteed by a schema check. Reference documents cover transit buffers,
rain planning, and calendar/route exports.

### Install from GitHub

Prerequisites: Node.js 22+ on PATH and a desktop host with local plugin support.
The repository's `.agents/plugins/marketplace.json` points to the packaged plugin
under `wayfinder/chatgpt/plugins/wayfinder`. Its server and all UI bundles are
committed, so consumers do not build dependencies.

```bash
codex plugin marketplace add frankyang-code4fun/agentic_plugins
```

Then open the desktop Plugins page, choose **Wayfinder Open-Source Travel
Plugins**, and install Wayfinder. Start a new **local Work** conversation. This
is a separate installation from the private account plugin updated in this chat;
use one copy at a time to avoid ambiguity. GitHub distributes files and does not
host the running MCP server. No Cloudflare tunnel is required.

For updates, use `codex plugin marketplace upgrade --help` for your CLI's options,
refresh the marketplace, then update/reinstall the plugin through the desktop UI.
Do not edit plugin cache files directly.

### Contributor release checks

Run `npm ci` in both `web` and `server`, then:

```bash
cd server
npm run build:plugin
node test/settings-package.mjs
node test/workspace.mjs
node test/mentions-and-forms.mjs
cd ../web
../server/node_modules/.bin/tsx --test test/travel-formats.test.ts
node --test test/file-editor-host.test.mjs
```

Commit source, lockfiles, manifests and rebuilt plugin bundles together. Keep
portable and compatibility manifest versions synchronized. The clean-package
test copies the install directory away from source/node_modules, starts its
bundled server, checks all views and validates settings persistence/updates.
The private account release uses `WAYFINDER_PLUGIN_ROUTE` set to its account
plugin ID; the GitHub package uses `wayfinder@wayfinder-oss` for deep links.
