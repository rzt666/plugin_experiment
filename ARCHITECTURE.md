# plugin_experiment — Architecture Spec

Role split: Claude (System Architect) defines scope/design here; Codex (Coder)
implements against this spec. Codex should update this file if it deviates
from the plan, and ask (stop and report) rather than guess on ambiguous product
decisions.

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

## Open questions for the architect (Claude) — do not silently decide

- Exact embedding model name/size to bundle vs download-on-first-use.
- Whether "context-aware" in v1 should bias search by (a) currently open
  note content, (b) recent note history, or (c) both — Codex should
  implement (a) first as the simplest defensible interpretation unless
  told otherwise.
