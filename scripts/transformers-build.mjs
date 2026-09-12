import { readFile } from "node:fs/promises";

// Obsidian exposes Node APIs inside its renderer. Force portable WASM instead
// of Transformers.js selecting onnxruntime-node and requiring native addons.
export const transformersPlugin = {
  name: "local-transformers-wasm",
  setup(build) {
    build.onLoad({ filter: /@xenova[\\/]transformers[\\/]src[\\/]backends[\\/]onnx\.js$/ }, async args => ({
      contents: 'import * as ort from "onnxruntime-web/dist/ort-web.node.js"; export const ONNX = ort.default ?? ort; export const executionProviders = ["wasm"];',
      resolveDir: args.path.replace(/[\\/][^\\/]+$/, ""), loader: "js",
    }));
    build.onLoad({ filter: /@xenova[\\/]transformers[\\/]src[\\/]env\.js$/ }, async args => ({
      // This URL only initializes defaults; configureEmbeddings supplies all
      // actual model/runtime paths. CJS bundles have no import.meta.url.
      contents: (await readFile(args.path, "utf8")).replaceAll("import.meta.url", '"file:///find-dont-search/runtime.js"'),
      loader: "js",
    }));
    build.onLoad({ filter: /onnxruntime-web[\\/]dist[\\/]ort-web\.node\.js$/ }, async args => ({
      // Keep the WASM runtime on its filesystem path even inside Electron's
      // renderer. Otherwise it tries browser fetch() before falling back to fs.
      contents: `(function(window, document, __filename, __dirname) {${await readFile(args.path, "utf8")}\n})(undefined, undefined, "", "");`,
      loader: "js",
    }));
    build.onResolve({ filter: /^sharp$/ }, () => ({ path: "unused-image-backend", namespace: "text-only" }));
    build.onLoad({ filter: /.*/, namespace: "text-only" }, () => ({ contents: "export default null;", loader: "js" }));
  },
};
