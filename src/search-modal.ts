import { Notice, SuggestModal, TFile } from "obsidian";
import type PluginExperiment from "../main";
import type { SimilarNote } from "./index";
import { rank } from "./adaptive";

const CONTEXT_WEIGHT = 0.15;
const DEBOUNCE_MS = 150;
const EMPTY_TEXT = "Nothing found yet — keep typing.";

export class SearchModal extends SuggestModal<SimilarNote> {
  private revision = 0;
  private closed = true;
  private timer?: ReturnType<typeof setTimeout>;
  private pending: Array<(notes: SimilarNote[]) => void> = [];
  private context?: number[];
  private snippets = new Map<string, string>();

  constructor(private readonly plugin: PluginExperiment) {
    super(plugin.app);
    this.setPlaceholder("Find a note...");
    this.emptyStateText = EMPTY_TEXT;
    this.limit = 10;
  }

  onOpen(): void {
    this.closed = false;
    const file = this.app.workspace.getActiveFile();
    const embedding = file && this.plugin.index.get(file.path)?.embedding;
    this.context = embedding ? [...embedding] : undefined;
    super.onOpen();
  }

  onClose(): void {
    this.closed = true;
    this.revision++;
    clearTimeout(this.timer);
    this.finish([]);
    this.snippets.clear();
    super.onClose();
  }

  getSuggestions(query: string): Promise<SimilarNote[]> {
    const revision = ++this.revision;
    clearTimeout(this.timer);
    // Settle superseded requests with the latest list so they cannot repaint stale results.
    const result = new Promise<SimilarNote[]>(resolve => this.pending.push(resolve));
    this.emptyStateText = this.plugin.indexStatus !== "ready" || !this.plugin.index.size
      ? "Index is still building…" : EMPTY_TEXT;
    if (this.closed || !query.trim() || this.plugin.indexStatus !== "ready" || !this.plugin.index.size) {
      this.finish([]);
    } else {
      this.timer = setTimeout(() => { void this.find(query.trim(), revision); }, DEBOUNCE_MS);
    }
    return result;
  }

  private finish(notes: SimilarNote[]): void {
    const pending = this.pending.splice(0);
    for (const resolve of pending) resolve(notes);
  }

  private async find(query: string, revision: number): Promise<void> {
    const isCurrent = () => !this.closed && revision === this.revision;
    try {
      const embedding = await this.plugin.embedQuery(query, isCurrent);
      if (!isCurrent()) return;
      if (!embedding) {
        this.emptyStateText = "Index is still building…";
        this.finish([]);
        return;
      }
      const blended = this.context
        ? embedding.map((value, i) => value * (1 - CONTEXT_WEIGHT) + this.context![i] * CONTEXT_WEIGHT)
        : embedding;
      const norm = Math.hypot(...blended);
      const notes = rank(this.plugin.index.searchSimilar(blended.map(value => value / norm), 20),
        this.plugin.adaptive, 10);
      const snippets = new Map<string, string>();
      const available = await Promise.all(notes.map(async note => {
        const file = this.app.vault.getAbstractFileByPath(note.path);
        if (!(file instanceof TFile)) return null;
        try {
          const content = await this.plugin.app.vault.cachedRead(file);
          const line = content.split(/\r?\n/).find(line => line.trim()) ?? "";
          const snippet = line.trim().replace(/^(?:(?:#{1,6}|>|[-+*]|\d+[.)])\s+|\[[ xX]\]\s+)*/, "");
          snippets.set(note.path, snippet.length > 120 ? snippet.slice(0, 119) + "…" : snippet);
          return file.path === note.path && this.app.vault.getAbstractFileByPath(note.path) === file ? note : null;
        } catch (error) {
          console.warn("Find, Don't Search: could not read note snippet", error);
          return null;
        }
      }));
      if (!isCurrent()) return;
      this.snippets = snippets;
      this.finish(available.filter((note): note is SimilarNote => note !== null));
    } catch (error) {
      if (!isCurrent()) return;
      console.error("Find, Don't Search: could not find notes", error);
      this.emptyStateText = "Couldn't find notes just now. Try again, or run Rebuild index.";
      this.finish([]);
    }
  }

  renderSuggestion(note: SimilarNote, el: HTMLElement): void {
    const file = this.app.vault.getAbstractFileByPath(note.path);
    el.createDiv({ text: file instanceof TFile ? file.basename : note.path, cls: "find-search-title" });
    el.createDiv({ text: this.snippets.get(note.path) ?? "", cls: "find-search-snippet" });
    el.setAttribute("title", note.path);
  }

  onChooseSuggestion(note: SimilarNote): void {
    const file = this.app.vault.getAbstractFileByPath(note.path);
    if (!(file instanceof TFile)) return;
    this.plugin.recordClick(note.path, "search");
    void this.app.workspace.getLeaf(false).openFile(file).catch(error => {
      console.error("Find, Don't Search: could not open note", error);
      new Notice("Couldn't open this note. It may have moved or been deleted.");
    });
  }
}
