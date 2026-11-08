import fs from "node:fs";
import path from "node:path";

const root = path.resolve("plugins/wayfinder");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "plugin.json"), "utf8"));
const mcp = JSON.parse(fs.readFileSync(path.join(root, "mcp.json"), "utf8"));
const ui = pkg.extensions?.["com.openai"]?.interface ?? {};
const VALID_CATEGORIES = new Set([
  "Productivity",
  "Creativity",
  "Developer Tools",
  "Business & Operations",
  "Data & Analytics",
  "Communication",
  "Education & Research",
  "Security",
  "Finance",
  "Healthcare",
  "Travel",
  "Entertainment",
  "Other",
]);

const errors = [];
if (!/^[a-zA-Z0-9_-]{1,64}$/.test(pkg.name ?? "")) {
  errors.push("plugin.json: invalid name");
}
if (!/^\d+\.\d+\.\d+/.test(pkg.version ?? "")) {
  errors.push("plugin.json: version must be semver");
}
if ((ui.displayName ?? "").length > 30) {
  errors.push("interface.displayName exceeds 30 chars");
}
if ((ui.shortDescription ?? "").length > 30) {
  errors.push("interface.shortDescription exceeds 30 chars");
}
if (!VALID_CATEGORIES.has(ui.category)) {
  errors.push(`Invalid category: ${ui.category}`);
}
if (
  (ui.defaultPrompt ?? []).length > 3 ||
  (ui.defaultPrompt ?? []).some((p) => p.length > 128 || p.includes("@"))
) {
  errors.push("defaultPrompt: max 3 single-line prompts <=128 chars, no @mentions");
}
if (Object.keys(mcp.mcpServers ?? {}).length !== 1) {
  errors.push("mcp.json: public plugins allow at most 1 MCP server");
}

for (const rel of [
  pkg.extensions?.["com.openai"]?.onboardingSkill,
  ui.composerIcon,
  ui.logo,
].filter(Boolean)) {
  if (!fs.existsSync(path.join(root, rel))) {
    errors.push(`Missing referenced file: ${rel}`);
  }
}

for (const entry of fs.readdirSync(path.join(root, "skills"), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;

  const mdPath = path.join(root, "skills", entry.name, "SKILL.md");
  if (!fs.existsSync(mdPath)) {
    errors.push(`Missing ${mdPath}`);
    continue;
  }

  const text = fs.readFileSync(mdPath, "utf8");
  if (!/^---\n[\s\S]*?name:\s*\S+[\s\S]*?description:\s*\S+[\s\S]*?\n---/.test(text)) {
    errors.push(`${entry.name}/SKILL.md missing valid YAML frontmatter (name + description)`);
  }
}

if (errors.length) {
  console.error("Validation failed:\n- " + errors.join("\n- "));
  process.exit(1);
}
console.log("✓ Wayfinder package manifest, assets, and SKILL.md frontmatter passed local validation.");
