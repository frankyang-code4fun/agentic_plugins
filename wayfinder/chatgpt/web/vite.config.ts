import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    emptyOutDir: !process.env.WAYFINDER_VIEW,
    rolldownOptions: {
      input: fileURLToPath(
        new URL(
          process.env.WAYFINDER_VIEW === "file-editor"
            ? "./file-editor.html"
            : process.env.WAYFINDER_VIEW === "workspace"
              ? "./workspace.html"
              : "./explore.html",
          import.meta.url,
        ),
      ),
    },
  },
});
