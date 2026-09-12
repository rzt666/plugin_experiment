import { FileSystemAdapter, Notice, Plugin, TFile } from "obsidian";
import { createHash } from "crypto";
import { join } from "path";
import { configureEmbeddings, DIMENSIONS, disposeEmbeddings, embed, INDEX_MODEL } from "./src/embeddings";
import { VectorStore } from "./src/index";

const NAME = "Find, Don't Search";
const CACHE_VERSION = 1;

export default class PluginExperiment extends Plugin {
  readonly index = new VectorStore(DIMENSIONS);
  private queue: Promise<void> = Promise.resolve();
  private stopped = false;
  private notice?: Notice;
  private data: Record<string, unknown> = {};

  async onload(): Promise<void> {
    console.log(`${NAME} — loaded`);
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) throw new Error(`${NAME} requires a desktop vault.`);
    configureEmbeddings(join(adapter.getBasePath(), this.manifest.dir ??
      `${this.app.vault.configDir}/plugins/${this.manifest.id}`), message => this.report(message));
    // Queue initialization before registering events so edits during startup are replayed afterwards.
    this.enqueue(async () => {
      const loaded: unknown = await this.loadData().catch((error: unknown) => {
        console.warn(`${NAME}: unreadable cache; rebuilding`, error);
        return null;
      });
      if (loaded && typeof loaded === "object" && !Array.isArray(loaded)) {
        this.data = loaded as Record<string, unknown>;
        const cache = this.data.index as { version?: number; model?: string; notes?: unknown } | undefined;
        if (cache?.version === CACHE_VERSION && cache.model === INDEX_MODEL) {
          const rejected = this.index.restore(cache.notes);
          if (rejected) console.warn(`${NAME}: discarded ${rejected} invalid cached entries`);
        }
      }
      await this.scan(false);
    });
    const update = (file: TFile) => this.enqueue(async () => {
      await this.updateNote(file);
      await this.persist();
      console.log(`${NAME}: ${this.index.size} notes indexed`);
    });
    this.registerEvent(this.app.vault.on("create", file => { if (file instanceof TFile) update(file); }));
    this.registerEvent(this.app.vault.on("modify", file => { if (file instanceof TFile) update(file); }));
    this.registerEvent(this.app.vault.on("delete", file => this.enqueue(async () => {
      for (const path of this.index.paths()) {
        if (path === file.path || path.startsWith(file.path + "/")) this.index.removeNote(path);
      }
      await this.persist();
    })));
    // Folder renames can change many note paths without create/delete events.
    this.registerEvent(this.app.vault.on("rename", () => this.enqueue(() => this.scan(false))));
    this.addCommand({ id: "rebuild-index", name: "Rebuild index", callback: () => {
      this.enqueue(() => this.scan(true));
    } });
  }

  private enqueue(work: () => Promise<void>): void {
    this.queue = this.queue.then(async () => {
      if (!this.stopped) await work();
    }).catch((error: unknown) => {
      console.error(`${NAME}: indexing failed`, error);
      if (!this.stopped) new Notice(`${NAME}: indexing failed. Check local model assets and the console.`, 10000);
    }).finally(() => { this.notice?.hide(); this.notice = undefined; });
  }

  private report(message: string): void {
    console.log(`${NAME}: ${message}`);
    if (this.stopped) return;
    if (!this.notice) this.notice = new Notice(`${NAME}: ${message}`, 0);
    else this.notice.setMessage(`${NAME}: ${message}`);
  }

  private async updateNote(file: TFile, force = false): Promise<boolean> {
    if (this.stopped || file.extension !== "md" || this.app.vault.getAbstractFileByPath(file.path) !== file) return false;
    const path = file.path;
    const mtime = file.stat.mtime;
    const content = await this.app.vault.read(file);
    const contentHash = createHash("sha256").update(content).digest("hex");
    const previous = this.index.get(path);
    // Hash also detects externally changed content with a preserved timestamp.
    const embedding = !force && previous?.contentHash === contentHash
      ? previous.embedding : await embed(content);
    // Never publish an embedding for a deleted, renamed, or subsequently edited note.
    if (this.stopped || file.path !== path || file.stat.mtime !== mtime ||
        this.app.vault.getAbstractFileByPath(path) !== file) return false;
    this.index.addOrUpdateNote(path, { embedding, mtime, contentHash });
    return true;
  }

  private async scan(force: boolean): Promise<void> {
    const files = this.app.vault.getMarkdownFiles();
    const live = new Set(files.map(file => file.path));
    for (const path of this.index.paths()) if (!live.has(path)) this.index.removeNote(path);
    this.report(`Indexing ${files.length} notes…`);
    for (let i = 0; i < files.length && !this.stopped; i++) {
      try { await this.updateNote(files[i], force); }
      catch (error) {
        console.error(`${NAME}: could not index ${files[i].path}`, error);
        // Missing model assets should not trigger another model load for every note.
        await this.persist();
        throw error;
      }
      if ((i + 1) % 25 === 0) await this.persist();
      if ((i + 1) % 10 === 0 || i === files.length - 1) this.report(`Processed ${i + 1}/${files.length} notes`);
    }
    await this.persist();
    if (!this.stopped) {
      const message = `Index complete: ${this.index.size} notes indexed.`;
      this.report(message);
      new Notice(`${NAME}: ${message}`, 6000);
    }
  }

  private async persist(): Promise<void> {
    if (this.stopped) return;
    await this.saveData({ ...this.data, index: {
      version: CACHE_VERSION, model: INDEX_MODEL, notes: this.index.toJSON(),
    } });
  }

  onunload(): void {
    this.stopped = true;
    this.notice?.hide();
    void this.queue.then(() => disposeEmbeddings()).catch(error => console.error(`${NAME}: cleanup failed`, error));
    console.log(`${NAME} — unloaded`);
  }
}
