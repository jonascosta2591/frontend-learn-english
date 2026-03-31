export interface Word {
  id: number;
  word: string;
  translation: string;
}

export interface Tile {
  id: string;
  pairId: number;
  text: string;
  lang: "en" | "pt";
  state: "idle" | "selected" | "matched" | "wrong";
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildTiles(pairs: Word[]): Tile[] {
  const tiles: Tile[] = [];
  for (const w of pairs) {
    tiles.push({ id: `en-${w.id}`, pairId: w.id, text: w.word, lang: "en", state: "idle" });
    tiles.push({ id: `pt-${w.id}`, pairId: w.id, text: w.translation, lang: "pt", state: "idle" });
  }
  return shuffle(tiles);
}

export function isPair(a: Tile, b: Tile): boolean {
  return a.pairId === b.pairId && a.lang !== b.lang;
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function selectBatch(pool: Word[], usedIds: Set<number>): { batch: Word[]; newUsedIds: Set<number> } {
  let available = pool.filter(w => !usedIds.has(w.id));
  let newUsedIds = new Set(usedIds);
  // Cycle if not enough
  if (available.length < 6) {
    newUsedIds = new Set<number>();
    available = [...pool];
  }
  const batch = shuffle(available).slice(0, 6);
  batch.forEach(w => newUsedIds.add(w.id));
  return { batch, newUsedIds };
}
