# Find, Don't Search

**Find. Don't Search.**

Milestone 1: a desktop Obsidian plugin scaffold that logs when enabled and
disabled. Embeddings, indexing, search, and related notes are not implemented.
See [ARCHITECTURE.md](ARCHITECTURE.md) for later milestones. The entry point is
`main.ts`; `src/` is reserved for those later modules.

## Build

Install Node.js with npm, then run from this repository:

```sh
npm install
npm run build
```

The build runs strict TypeScript checking before esbuild produces `main.js` in
the repository root. Dependencies are pinned in `package-lock.json`; subsequent
clean installs can use `npm ci`. Generated bundles and `node_modules/` are
excluded from Git.

Dependency declaration checking is skipped (`skipLibCheck`) because the Obsidian
API types contain upstream declaration errors; plugin source is checked strictly.

Use `npm run dev` to rebuild on source changes (bundling only), and
`npm run typecheck` to check TypeScript separately.

## Load and verify in a test vault

1. Create or open a test vault in desktop Obsidian (version 1.0.0 or newer).
2. Create `<test-vault>/.obsidian/plugins/plugin_experiment/` and copy
   `manifest.json`, the built `main.js`, and `styles.css` into that folder.
3. In **Settings → Community plugins**, turn off Restricted mode if needed.
   Restart Obsidian, then enable **Find, Don't Search** in the installed list.
4. Open developer tools with **Cmd+Option+I** on macOS or **Ctrl+Shift+I** on
   Windows/Linux. In the Console, confirm `Find, Don't Search — loaded` appears.
5. Disable the plugin and confirm `Find, Don't Search — unloaded` appears.

After rebuilding, copy the updated files into the test vault and disable/enable
the plugin to reload it. No commands or other UI are expected in this milestone.

The build setup follows the
[official Obsidian sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin),
with the root entry point required by this repository's architecture.
