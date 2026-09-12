import type { SimilarNote } from "./index";

export const CLICKS_VERSION = 1;
export const BOOST_WEIGHT = 0.1;
const MAX_CLICKS = 500;
const HALF_LIFE_MS = 14 * 86400000;

export type ClickSource = "search" | "related";
interface ClickEntry { path: string; timestamp: number; source: ClickSource }

export class AdaptiveTracker {
  private entries: ClickEntry[] = [];

  record(path: string, source: ClickSource): void {
    this.entries.push({ path, timestamp: Date.now(), source });
    this.entries = this.entries.slice(-MAX_CLICKS);
  }

  toJSON(): ClickEntry[] { return this.entries.map(entry => ({ ...entry })); }

  restore(entries: unknown): number {
    this.entries = [];
    if (!Array.isArray(entries)) return 0;
    let rejected = 0;
    for (const entry of entries) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry) ||
          typeof entry.path !== "string" || !entry.path.trim() ||
          typeof entry.timestamp !== "number" || !Number.isFinite(entry.timestamp) || entry.timestamp < 0 ||
          (entry.source !== "search" && entry.source !== "related")) {
        rejected++;
        continue;
      }
      this.entries.push({ path: entry.path, timestamp: entry.timestamp, source: entry.source });
    }
    this.entries = this.entries.slice(-MAX_CLICKS);
    return rejected;
  }

  boost(path: string): number {
    const now = Date.now();
    let boost = 0;
    for (const entry of this.entries) {
      if (entry.path === path) {
        // Clock changes must not amplify a future-dated click beyond a fresh one.
        const ageMs = Math.max(0, now - entry.timestamp);
        boost += Math.pow(0.5, ageMs / HALF_LIFE_MS);
      }
    }
    return boost / (boost + 1);
  }
}

export function rank(candidates: SimilarNote[], tracker: AdaptiveTracker, topN: number, enabled = true): SimilarNote[] {
  return candidates.map(note => ({ note, finalScore: note.score + (enabled ? BOOST_WEIGHT * tracker.boost(note.path) : 0) }))
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, topN).map(({ note }) => note);
}
