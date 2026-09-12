# Find, Don't Search

**Find. Don't Search.**

Milestone 2 implements offline note indexing: local MiniLM embeddings, cosine
similarity, persistence, and incremental vault updates. The plugin id remains
`plugin_experiment`. Related notes and search UI are later milestones.
See [ARCHITECTURE.md](ARCHITECTURE.md).

## Build and prepare offline assets

Use Node.js 18+ with npm, then run from this repository:

```sh
npm install
npm run prepare:model
npm run build
```

`prepare:model` is an explicit, network-connected **packaging step**. It downloads
quantized `Xenova/all-MiniLM-L6-v2` from a pinned revision into `models/` and copies
ONNX WASM binaries into `wasm/`. Run it once before installation; these generated
directories are excluded from Git. Distribute both directories with the plugin
so first launch also works offline. The plugin never downloads models or sends
note content anywhere. Missing assets produce a Notice and console error;
install the assets and run Rebuild index to retry.

The build checks TypeScript strictly before esbuild produces `main.js`.
Dependencies are locked in `package-lock.json`; subsequent installs can use
`npm ci`. `npm run dev` watches and bundles; `npm run typecheck` checks types.
`skipLibCheck` skips upstream declaration errors, not plugin source checking.

Transformers.js uses ONNX Runtime Web's Node-compatible WASM build, forced to
load files locally inside Electron. Native ONNX and sharp image processing are
excluded from the bundle. The model loads lazily; `embedBatch(texts, batchSize)`
supports bounded batches. Embeddings are normalized, mean-pooled, 384-dimensional
vectors. Long notes are truncated at the tokenizer's limit; chunking is deferred.

## Load and verify in a test vault

1. Create `<test-vault>/.obsidian/plugins/plugin_experiment/` in desktop Obsidian.
2. Copy `manifest.json`, `main.js`, `styles.css`, **`models/` and `wasm/`** into it.
   The model must be at `models/Xenova/all-MiniLM-L6-v2/onnx/model_quantized.onnx`.
3. Add several Markdown notes. Disconnect networking, enable community plugins,
   then enable **Find, Don't Search**.
4. Open developer tools (**Cmd+Option+I** on macOS or **Ctrl+Shift+I** elsewhere).
   Confirm model-loading progress and `Index complete: N notes indexed.` Notices
   also show progress and completion. The first run may take time on CPU.
5. Inspect the plugin's `data.json`: `index.notes` maps paths to
   `{embedding, mtime, contentHash}`. It stores no raw note text.
6. Disable/enable the plugin. Unchanged notes reuse embeddings without a model
   loading message. Notes are still read and hashed to detect content changes
   with preserved timestamps; timestamp-only changes reuse the vector.
7. Create, edit, delete, and rename notes, including renaming a folder. Confirm
   `data.json` reflects current paths and changed content. Queued operations
   serialize embedding and saves; deleted notes cannot be resurrected by an
   in-flight embedding.
8. Run **Find, Don't Search: Rebuild index** from the command palette. It forces
   all current Markdown notes to be embedded again and logs the final count.

Startup prunes deleted paths, validates cached vectors, and invalidates caches
with a different schema/model fingerprint. Saves checkpoint every 25 startup
notes and after each incremental update. A failed scan keeps completed work
and reports an error; retry after resolving the error. After rebuilding, copy
updated files and disable/enable the plugin.

## Automated verification

After preparing assets:

```sh
npm run verify:index
npm run verify:pipeline
```

The first script runs real MiniLM single/batch inference with network requests
blocked and checks cosine ranking, serialization, update/delete, and invalid
vectors. The second uses mocked Obsidian APIs/embeddings to verify cache reuse,
content changes, vault events, rebuilding, and deletion during inference.
These checks do not replace loading the plugin in desktop Obsidian.

`npm install` reports five upstream dependency advisories (four high, one
critical) in the requested Transformers.js 2.x dependency tree. The bundle
excludes sharp and native ONNX; this does not resolve all dependency advisories.
No automatic breaking dependency upgrades are applied.
