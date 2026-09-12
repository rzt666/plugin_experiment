# Find, Don't Search

**Find. Don't Search.**

**Found for you** surfaces related notes as you move through your vault.
Milestone 4 adds **Find a note**, a semantic search modal with ranked titles
and snippets, backed by offline MiniLM embeddings and a persistent incremental
index. Milestone 5 adds adaptive re-ranking based on local click recency and
frequency. The plugin id remains `plugin_experiment`.
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

## Verify related notes (Milestone 3)

1. Open the panel using the ribbon icon or **Find, Don't Search: Open related
   notes**. Confirm **Found for you** appears in the right sidebar.
2. Open a Markdown note among at least seven notes. Confirm at most five other
   notes appear, ordered by similarity, with titles and subtle percentages.
   Click a title to open it; confirm suggestions follow the newly opened note.
3. Switch notes quickly during indexing and after startup. Confirm only the
   current note's connections appear and startup's friendly waiting state
   updates automatically when indexing finishes.
4. Edit, rename, or delete notes and confirm suggestions update after indexing.
   Test an empty vault, a single note, and no active Markdown file for friendly
   empty states. Missing model assets should show recovery guidance.
5. Restart Obsidian with the panel open and confirm the workspace restores it.
   Close it, restart again, and confirm it stays closed. Repeatedly invoke the
   command and confirm it reveals the existing panel without duplicates.

The panel reuses hash-validated embeddings through the existing indexing queue;
similarity percentages are cosine scores, not confidence estimates. No click
history leaves the vault. Desktop UI checks above require manual verification.

## Verify semantic search (Milestone 4)

1. Open the command palette → **Find, Don't Search: Find a note**, or click the
   search ribbon icon. Confirm the placeholder reads **Find a note...**.
2. Type a topic covered by your notes, including a paraphrase rather than an
   exact keyword. Confirm up to ten notes appear in similarity order, with
   basenames and first non-empty-line snippets. Check heading/list markers are
   stripped and long snippets are truncated to 120 characters.
3. Click a result and confirm it opens in the current leaf. Reopen the modal
   and verify arrow-key selection and Enter also open a note.
4. Open a note on a different topic, then invoke **Find a note** and enter an
   exact-topic query. Confirm the active note's context does not crowd out the
   query topic. Repeat with no active note. Context uses the cached embedding
   captured on opening, blended with a fixed 15% weight; the query gets 85%.
5. Type and replace queries quickly, clear the input, and close/reopen during
   inference. Confirm old results do not replace the latest query's results.
   Blank input shows **Nothing found yet — keep typing.** Query embedding is
   debounced by 150 ms and serialized with indexing.
6. Open the modal during initial indexing or Rebuild index, and in an empty
   vault. Confirm **Index is still building…** appears without throwing. After
   indexing completes, type again to retrieve notes. Delete/rename a candidate
   while searching and confirm missing notes do not cause an uncaught error.
7. Repeat a query with networking disconnected to confirm local operation.

These desktop UI and relevance checks require manual verification in Obsidian.

## Verify adaptive re-ranking (Milestone 5)

1. Start in a test vault with no click history. Confirm related notes and search
   results retain their original cosine order before clicking anything.
2. Choose a related note or search result with a slightly lower raw cosine score
   than the leading note. Click it a few times, returning to the same original
   note before reopening the panel or modal with the same or a similar query.
   Confirm the clicked note moves at or near the top. Repeat for both surfaces;
   search selection with Enter also records a click.
3. The panel's percentages remain raw cosine similarity, so a boosted note can
   appear above one with a marginally higher percentage. Both surfaces consider
   20 cosine candidates, then keep five related notes or ten search results.
4. Inspect `data.json`: `clicks.version` and `clicks.entries` live alongside
   `index`. Each click stores only path, timestamp, and source (`search` or
   `related`); only the latest 500 entries are retained. Disable/enable the
   plugin and confirm the history and ranking survive without re-embedding
   unchanged notes.

Each click decays with a 14-day half-life. The summed signal is squashed and
weighted by 0.1, so the added score stays below 0.1. Boosting is always on in
this milestone; zero history adds zero boost. Click saves run in the background
and do not block opening notes. These UI checks require manual verification
in desktop Obsidian.
