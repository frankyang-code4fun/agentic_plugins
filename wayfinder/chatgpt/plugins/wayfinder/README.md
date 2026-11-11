# Wayfinder

Local travel planning plugin for ChatGPT Work/Codex desktop. Requires Node.js 22+
on PATH and a local Work conversation. No Cloudflare tunnel or separate server
launch is needed; the host starts the bundled stdio process.

Includes a trip library, itinerary tray, travel-file editor, saved-trip mentions,
demo room picker, native preference controls, and three planning/setup skills.

Install this repository as a marketplace:

```sh
codex plugin marketplace add frankyang-code4fun/agentic_plugins
```

Open Plugins, choose **Wayfinder Open-Source Travel Plugins**, and install
Wayfinder. Start a new local conversation. Setup asks for preferences; it is
skippable. Plugin settings expose home airport, currency, pace and dietary notes.
Availability of native settings, forms and file viewers depends on your host.

Settings and saved trips are local to this computer in the Wayfinder directory
under XDG_DATA_HOME (default ~/.local/share/wayfinder). No login or API key is
required. Place search, forecasts and FX contact OpenStreetMap/Nominatim/Overpass,
Open-Meteo and Frankfurter; map rendering contacts OpenStreetMap tile servers.
Travel search arguments are sent to these providers. Dietary preferences are
stored locally; generated planning prompts may include them in the conversation.
The stay picker and hotel hold are demonstrations, not actual reservations.

This GitHub distribution is separate from a private account-installed Wayfinder.
Enable one copy when testing to avoid duplicate tool names. Built files are
committed so installation needs no npm install. Contributors should follow the
source README at ../../README.md to rebuild and test. MIT licensed; dependency
license notices are retained in bundled output where provided by dependencies.
