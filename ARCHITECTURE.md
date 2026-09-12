# plugin_experiment — Architecture Spec

Role split: Claude (System Architect) defines scope/design here; Codex (Coder)
implements against this spec. Codex should update this file if it deviates
from the plan, and ask (stop and report) rather than guess on ambiguous product
decisions.

## Slogan / product identity

**"Find. Don't Search."**

This is the guiding UX principle, not just marketing copy:
- The plugin should surface relevant notes proactively (related notes panel,
  context-aware ranking) so the user finds what they need without typing a
  query — search is the fallback, not the primary interaction.
- Copy in the UI (command names, empty states, settings descriptions) should
  reflect this: favor language like "Related", "Surfaced", "Found for you"
  over generic "Search results". The search modal is still needed (v1
  milestone 4) but the related-notes panel (milestone 3) is the flagship
  feature expressing the slogan and should not be deprioritized as "just a
  sidebar".
- Plugin display name should incorporate this identity — see naming below.

## Product summary

An Obsidian plugin providing:

1. **Context-aware semantic search** — a search interface where the query is
   embedded and ranked against vault note embeddings by cosine similarity
   (not plain keyword match). "Context-aware" = when a note is open, its
   content/recent-note history can bias the query embedding or rank boost.
2. **Related notes panel** — a sidebar view that, for the currently active
   note, shows the top-N most semantically similar other notes, live-updating
   on file switch.
3. **User-adaptive ranking** — track which search results / related-note
   suggestions the user actually opens (click-through), and lightly re-rank
   future results toward previously-clicked notes/authors/tags (recency +
   frequency weighted boost on top of cosine similarity — not a retrained
   model).

## Non-goals (v1)

- No cloud/API calls of any kind — all embedding inference is local
  (privacy requirement, personal vault content).
- No full ML training loop for "adaptive" — a simple weighted boost is
  sufficient for v1.
- No mobile support requirement for v1 (desktop Obsidian only is fine to
  start; note if transformers.js/WASM works on mobile but don't block on it).

## Naming

- Plugin `id` in manifest.json stays `plugin_experiment` (repo/id already
  fixed, don't rename mid-build — Obsidian plugin IDs are hard to migrate).
- Plugin `name` (display name shown in Obsidian's UI) should be **"Find,
  Don't Search"**.
- README title and top tagline should use the slogan.

## Tech stack

- TypeScript, Obsidian Plugin API (`obsidian` package types)
- Build: esbuild (standard Obsidian plugin build script pattern)
- Embeddings: `@xenova/transformers` (transformers.js) running a small
  sentence-embedding model fully locally/offline (e.g. a MiniLM-class
  sentence-transformers model bundled or downloaded once and cached).
- Vector index: simple in-memory array + cosine similarity is fine for v1
  vault sizes (hundreds–low thousands of notes). No external vector DB.
- Persistence: store computed embeddings + note mtime in the plugin's data
  file (`.obsidian/plugins/plugin_experiment/data.json` or a dedicated
  cache file) so we don't recompute on every launch — only recompute for
  changed/new notes (diff by mtime or content hash).

## Repo layout (proposed)

```
plugin_experiment/
  manifest.json
  package.json
  esbuild.config.mjs
  tsconfig.json
  main.ts                 (plugin entry: onload/onunload, commands, settings tab)
  src/
    embeddings.ts          (model load, embed(text) -> vector, batching)
    index.ts               (vector store: add/update/remove note, similarity search)
    search-view.ts          (search modal/view UI)
    related-notes-view.ts   (sidebar ItemView)
    adaptive.ts             (click tracking + re-rank boost logic)
    settings.ts             (plugin settings: model choice, top-N, re-index)
  styles.css
  ARCHITECTURE.md
  README.md
```

## Milestones (build in this order)

1. **Scaffold**: standard Obsidian plugin skeleton (manifest, esbuild,
   package.json, empty main.ts that loads/logs). Verify `npm run build`
   produces `main.js` with no errors.
2. **Indexing pipeline**: load transformers.js model, embed all vault
   markdown notes on first load (with a progress notice), cache to disk,
   incremental re-embed on file modify/create/delete events.
3. **Related notes panel**: sidebar view, top-5 similar notes to active
   file, click to open.
4. **Semantic search**: command/modal, query embedding, ranked results list
   with note title + snippet, click to open.
5. **Adaptive re-ranking**: log clicks (note path, timestamp, query/context)
   to a small local history, apply a boost factor in ranking based on
   click recency/frequency for that note (and optionally shared
   tags/folder).
6. **Settings tab**: choose N results, toggle context-aware boosting,
   manual "rebuild index" button, show index status (# notes indexed).

## Definition of done per milestone

- Code builds (`npm run build`) with zero TS errors.
- Manual verification steps documented in README (since there's no
  automated Obsidian test harness for v1) — e.g. "load plugin in a test
  vault, open note X, confirm sidebar shows related notes."
- Commit after each milestone with a clear message; don't squash into one
  giant commit.

## Milestone 4 implementation decisions

- New file `src/search-modal.ts`: a class extending Obsidian's `SuggestModal<SimilarNote>`
  (generic type from `src/index.ts`). `getSuggestions` is async — embed the
  query text with the existing `embed()` from `src/embeddings.ts` and rank via
  `VectorStore.searchSimilar`, same pattern `main.ts` already uses for related
  notes. Debounce query embedding (e.g. ~150ms) so we don't embed on every
  keystroke; Obsidian's `SuggestModal` re-invokes `getSuggestions` on input,
  so debounce inside the modal (cancel/ignore stale in-flight calls, resolve
  only the latest).
- Context-aware bias (resolves the open question in favor of option (a)):
  when the modal opens, capture the workspace's currently active file (if
  any) and its cached embedding from `this.index`. Blend it into the query
  embedding as `normalize(queryEmbedding * (1 - w) + activeFileEmbedding * w)`
  with a small fixed weight `w` (start at `0.15`) — the query still dominates.
  If there is no active file or it isn't indexed yet, skip the blend
  (plain query embedding). Keep the weight a named constant near the top of
  the file so it's easy to tune later; no settings UI for it yet (milestone 6).
- Results: top 10 candidates from `searchSimilar`, render note basename as
  title and a snippet as the first non-empty line of the note content
  (strip leading `#`/markdown list/heading markers), truncated to ~120 chars.
  Reading file content for the snippet is a normal `this.plugin.app.vault
  .cachedRead(file)` call — fine at this list size (max 10), don't cache
  snippets in the index.
  `onChooseSuggestion` opens the note in the current leaf (`workspace
  .getLeaf(false).openFile(file)`), matching the related-notes panel's
  click-to-open behavior.
- Empty/placeholder copy should follow the slogan tone from the Naming
  section: placeholder text "Find a note..." (not "Search..."), empty-state
  message "Nothing found yet — keep typing." This is the fallback modal, not
  the flagship feature, but copy should still avoid bare "Search results".
- Register command `id: "search-notes"`, `name: "Find a note"` in
  `main.ts`'s `onload`, alongside the existing `open-related-notes` and
  `rebuild-index` commands. Also add a ribbon icon (`search` icon) opening
  the same modal, mirroring the existing related-notes ribbon icon pattern.
- If the vector index is empty or still building (`indexStatus !== "ready"`),
  the modal should still open but show an explanatory empty state
  ("Index is still building…") rather than throwing — don't block opening
  the command on index readiness.
- Update README.md with a manual verification section for this milestone
  (open command palette → "Find a note", type a query, confirm ranked
  results appear and clicking one opens the note; verify with an active
  note open that context bias doesn't crowd out an exact-topic query).

## Open questions for the architect (Claude) — do not silently decide

- Model and offline asset provisioning: resolved for milestone 2 below.
- Whether "context-aware" in v1 should bias search by (a) currently open
  note content, (b) recent note history, or (c) both — Codex should
  implement (a) first as the simplest defensible interpretation unless
  told otherwise.

## Milestone 2 implementation decisions

- The requested MiniLM example is now the concrete model:
  `Xenova/all-MiniLM-L6-v2`, quantized ONNX, revision
  `751bff37182d3f1213fa05d7196b954e230abad9`, mean pooling and normalization
  (384 dimensions). Bump the cache model fingerprint if assets or preprocessing
  change. Long notes use tokenizer truncation; chunking is deferred.
- Resolve the earlier bundle-vs-download question in favor of **bundled local
  assets**, to meet the explicit fully-offline requirement even on first use.
  `npm run prepare:model` downloads assets at packaging time; copy generated
  `models/` and `wasm/` with the plugin. Runtime remote loading is disabled.
  Missing assets fail visibly, with no download fallback.
- esbuild substitutes Transformers.js's environment-selected ONNX backend with
  ONNX Runtime Web's Node-compatible WASM build, isolates that runtime from
  browser globals, and excludes the unused sharp image backend. Electron exposes
  both browser and Node APIs: default selection would require native ONNX,
  while the browser-only WASM build contains filesystem stubs. The adapter keeps
  inference in WASM and file loading local, with one thread.
- The index uses a Map keyed by path and linear cosine ranking. Cache data lives
  under `data.json.index` with a schema version and model fingerprint. Hashes are
  checked even when mtime matches; unchanged content reuses its embedding.
- Add rename handling alongside create/modify/delete because Obsidian renames
  do not necessarily emit those events, including folder moves. Work and saves
  are serialized, with shutdown and stale-result guards.
- Expose **Find, Don't Search: Rebuild index** for milestone verification.
  No settings tab, related-notes panel, or search UI is included.
