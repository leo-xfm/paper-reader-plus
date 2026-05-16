import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          const normalizedId = id.replace(/\\/g, "/");
          if (
            normalizedId.includes("/node_modules/vue/") ||
            normalizedId.includes("/node_modules/@vue/") ||
            normalizedId.includes("/node_modules/pinia/")
          ) return "vendor-vue";
          if (normalizedId.includes("/node_modules/pdfjs-dist/")) return "vendor-pdf";
          if (
            normalizedId.includes("/node_modules/markdown-it/") ||
            normalizedId.includes("/node_modules/katex/") ||
            normalizedId.includes("/node_modules/entities/") ||
            normalizedId.includes("/node_modules/linkify-it/") ||
            normalizedId.includes("/node_modules/mdurl/") ||
            normalizedId.includes("/node_modules/uc.micro/") ||
            normalizedId.includes("/node_modules/argparse/")
          ) return "vendor-markdown";
          if (
            normalizedId.includes("/node_modules/prosemirror-") ||
            normalizedId.includes("/node_modules/orderedmap/") ||
            normalizedId.includes("/node_modules/w3c-keyname/") ||
            normalizedId.includes("/node_modules/rope-sequence/")
          ) return "vendor-editor";
          if (normalizedId.includes("/node_modules/lucide-vue-next/")) return "vendor-icons";
          if (
            normalizedId.includes("/node_modules/jszip/") ||
            normalizedId.includes("/node_modules/pako/") ||
            normalizedId.includes("/node_modules/readable-stream/") ||
            normalizedId.includes("/node_modules/setimmediate/")
          ) return "vendor-utils";
          return "vendor-utils";
        },
      },
    },
  },
});
