# Agentic Plugins

## Wayfinder

A local travel-planning plugin with maps, saved-trip library, itinerary tray,
travel-file editor, searchable trip mentions, traveler settings and planning skills.

Requires Node.js 22+ and ChatGPT Work/Codex desktop with local plugin support.

```bash
codex plugin marketplace add frankyang-code4fun/agentic_plugins
```

In the desktop Plugins page, choose **Wayfinder Open-Source Travel Plugins** and
install Wayfinder. Start a **local Work** chat; the desktop launches the bundled
MCP server. No tunnel or npm build is needed for installation.

- [Development and test instructions](wayfinder/chatgpt/README.md)
- [Plugin package and local-data details](wayfinder/chatgpt/plugins/wayfinder/README.md)
- [Example travel files](wayfinder/chatgpt/examples)

Wayfinder's hotel hold and room picker are demos, not real booking services.
External place/weather/FX providers may be unavailable or rate-limited.

Source and Wayfinder assets are MIT licensed. Bundled dependencies retain their
respective licenses.
