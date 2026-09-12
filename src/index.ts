export interface NoteEntry {
  embedding: number[];
  mtime: number;
  contentHash: string;
}
export interface SimilarNote { path: string; score: number }

export class VectorStore {
  private notes = new Map<string, NoteEntry>();
  constructor(readonly dimensions = 384) {}
  get size(): number { return this.notes.size; }
  get(path: string): NoteEntry | undefined { return this.notes.get(path); }
  paths(): string[] { return [...this.notes.keys()]; }
  clear(): void { this.notes.clear(); }

  addOrUpdateNote(path: string, entry: NoteEntry): void {
    if (!this.validVector(entry.embedding) || !Number.isFinite(entry.mtime) ||
        !/^[a-f0-9]{64}$/.test(entry.contentHash)) throw new Error(`Invalid index entry: ${path}`);
    this.notes.set(path, { ...entry, embedding: [...entry.embedding] });
  }
  removeNote(path: string): void { this.notes.delete(path); }

  searchSimilar(queryVector: number[], topN = 5): SimilarNote[] {
    if (!this.validVector(queryVector)) throw new Error("Invalid query vector");
    if (!Number.isInteger(topN) || topN < 0) throw new Error("Invalid result count");
    const queryNorm = Math.hypot(...queryVector);
    return [...this.notes].map(([path, { embedding }]) => ({
      path,
      score: embedding.reduce((sum, value, i) => sum + value * queryVector[i], 0) /
        (queryNorm * Math.hypot(...embedding)),
    })).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, topN);
  }

  toJSON(): Record<string, NoteEntry> { return Object.fromEntries(this.notes); }
  restore(entries: unknown): number {
    this.clear();
    let rejected = 0;
    if (!entries || typeof entries !== "object" || Array.isArray(entries)) return rejected;
    for (const [path, entry] of Object.entries(entries)) {
      try { this.addOrUpdateNote(path, entry as NoteEntry); } catch { rejected++; }
    }
    return rejected;
  }
  private validVector(vector: number[]): boolean {
    return Array.isArray(vector) && vector.length === this.dimensions &&
      vector.every(Number.isFinite) && Math.hypot(...vector) > 0;
  }
}
