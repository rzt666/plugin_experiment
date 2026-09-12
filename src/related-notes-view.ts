import { ItemView, TFile, type WorkspaceLeaf } from "obsidian";
import type PluginExperiment from "../main";

export const RELATED_NOTES_VIEW = "find-dont-search-related-notes";

export class RelatedNotesView extends ItemView {
  private revision = 0;
  private closed = true;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: PluginExperiment) {
    super(leaf);
  }

  getViewType(): string { return RELATED_NOTES_VIEW; }
  getDisplayText(): string { return "Found for you"; }
  getIcon(): string { return "links-coming-in"; }

  async onOpen(): Promise<void> {
    this.closed = false;
    this.contentEl.addClass("find-related-notes");
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => { void this.refresh(); }));
    this.registerEvent(this.app.workspace.on("file-open", () => { void this.refresh(); }));
    await this.refresh();
  }

  async onClose(): Promise<void> {
    this.closed = true;
    this.revision++;
  }

  private message(text: string): void {
    this.contentEl.empty();
    this.contentEl.createEl("p", { text, cls: "find-related-empty", attr: { role: "status" } });
  }

  async refresh(): Promise<void> {
    if (this.closed) return;
    const revision = ++this.revision;
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md") {
      this.message("Open a note and discover what connects to it.");
      return;
    }
    if (this.plugin.indexStatus !== "ready") {
      this.message(this.plugin.indexStatus === "loading"
        ? "Getting to know your notes… Connections will appear here when your index is ready."
        : "Your connections aren't ready yet. Check the local model assets, then run Rebuild index.");
      return;
    }
    const path = file.path;
    const mtime = file.stat.mtime;
    this.message("Finding connections…");
    try {
      const notes = await this.plugin.relatedNotes(file);
      if (this.closed || revision !== this.revision || this.app.workspace.getActiveFile() !== file ||
          file.path !== path || file.stat.mtime !== mtime) return;
      const available = notes.flatMap(note => {
        const target = this.app.vault.getAbstractFileByPath(note.path);
        return target instanceof TFile ? [{ target, score: note.score }] : [];
      });
      if (!available.length) {
        this.message("No connections yet. Add another note and let your ideas find each other.");
        return;
      }
      this.contentEl.empty();
      this.contentEl.createEl("p", { text: `Connected to ${file.basename}`, cls: "find-related-context" });
      const list = this.contentEl.createEl("ul", { cls: "find-related-list" });
      for (const { target, score } of available) {
        const item = list.createEl("li");
        const link = item.createEl("a", { cls: "find-related-link", href: target.path,
          attr: { "aria-label": `${target.basename}, ${Math.round(score * 100)}% similarity`, title: target.path } });
        link.createSpan({ text: target.basename, cls: "find-related-title" });
        link.createSpan({ text: `${Math.round(score * 100)}%`, cls: "find-related-score" });
        link.addEventListener("click", event => {
          event.preventDefault();
          this.plugin.recordClick(target.path, "related");
          void this.app.workspace.openLinkText(target.path, path, event.ctrlKey || event.metaKey);
        });
      }
    } catch (error) {
      if (this.closed || revision !== this.revision) return;
      console.error("Find, Don't Search: could not find related notes", error);
      this.message("Couldn't find connections just now. Try reopening this note, or run Rebuild index.");
    }
  }
}
