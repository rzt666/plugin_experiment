import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { transformersPlugin } from "./transformers-build.mjs";

const temporary = await mkdtemp(join(tmpdir(), "find-index-"));
try {
  const bundle = join(temporary, "verify.cjs");
  await build({ stdin: { contents: 'export * from "./src/embeddings"; export * from "./src/index";', resolveDir: process.cwd(), loader: "ts" },
    bundle: true, platform: "node", format: "cjs", outfile: bundle, plugins: [transformersPlugin] });
  globalThis.window = {};
  globalThis.self = globalThis; // Electron renderer global expected by the WASM UMD build.
  const { configureEmbeddings, embed, embedBatch, disposeEmbeddings, VectorStore } = createRequire(import.meta.url)(bundle);
  let networkAttempts = 0;
  globalThis.fetch = async () => { networkAttempts++; throw new Error("Network disabled for offline verification"); };
  configureEmbeddings(resolve("."), console.log);
  const [cat, dog, database] = await embedBatch(["A kitten plays with a cat.", "A puppy plays with a dog.", "SQL database query optimization."]);
  assert.equal(cat.length, 384);
  assert(cat.every(Number.isFinite));
  const store = new VectorStore();
  const entry = embedding => ({ embedding, mtime: 123, contentHash: "a".repeat(64) });
  store.addOrUpdateNote("cat.md", entry(cat));
  store.addOrUpdateNote("dog.md", entry(dog));
  store.addOrUpdateNote("database.md", entry(database));
  assert.equal(store.searchSimilar(await embed("A kitten plays with a cat."), 1)[0].path, "cat.md");
  assert.equal(store.searchSimilar(cat, 0).length, 0);
  const restored = new VectorStore();
  restored.restore(JSON.parse(JSON.stringify(store.toJSON())));
  assert.deepEqual(restored.searchSimilar(cat), store.searchSimilar(cat));
  restored.addOrUpdateNote("cat.md", entry(database));
  assert.equal(restored.size, 3);
  restored.removeNote("cat.md");
  assert.equal(restored.size, 2);
  assert.throws(() => restored.searchSimilar([1]));
  assert.equal(restored.restore({ broken: { embedding: [NaN] } }), 1);
  assert.equal(networkAttempts, 0, "No network requests, including runtime initialization");
  await disposeEmbeddings();
  console.log("PASS: offline MiniLM single/batch inference, cosine ranking, persistence round-trip, update/delete, invalid vectors.");
} finally {
  await rm(temporary, { recursive: true, force: true });
}
