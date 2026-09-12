import esbuild from "esbuild";
import { transformersPlugin } from "./scripts/transformers-build.mjs";
import { builtinModules } from "node:module";

const production = process.argv[2] === "production";

const context = await esbuild.context({
  entryPoints: ["main.ts"],
  bundle: true,
  platform: "node",
  plugins: [transformersPlugin],
  external: [
    "obsidian",
    "electron",
    "@codemirror/*",
    "@lezer/*",
    ...builtinModules,
    "node:*",
  ],
  format: "cjs",
  target: "es2021",
  sourcemap: production ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  logLevel: "info",
});

if (production) {
  try {
    await context.rebuild();
  } finally {
    await context.dispose();
  }
} else {
  await context.watch();
}
