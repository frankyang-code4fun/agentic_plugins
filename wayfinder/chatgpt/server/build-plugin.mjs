import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdir, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const web = fileURLToPath(new URL("../web/", import.meta.url));
const plugin = fileURLToPath(new URL("../plugins/wayfinder/", import.meta.url));
execFileSync("npm", ["run", "build"], { cwd: web, stdio: "inherit" });
await build({
  entryPoints: [fileURLToPath(new URL("src/stdio.ts", import.meta.url))],
  outfile: `${plugin}/server/dist/stdio.mjs`,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
});
await mkdir(`${plugin}/web/dist`, { recursive: true });
await copyFile(`${web}/dist/explore.html`, `${plugin}/web/dist/explore.html`);
console.log("Built plugin stdio server and explorer HTML");
