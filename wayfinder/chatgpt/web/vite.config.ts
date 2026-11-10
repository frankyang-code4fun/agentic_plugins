import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    rolldownOptions: {
      input: fileURLToPath(new URL("./explore.html", import.meta.url)),
    },
  },
});
