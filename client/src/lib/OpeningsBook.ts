/**
 * Book of known chess openings, loaded once from `openings.csv`.
 *
 * Usage: `await load()` first. After that `isKnownMovePath` can be used synchronously.
 * Moves are always SAN, e.g. ["e4", "e5", "Nf3"].
 */
export namespace OpeningsBook {
  export interface Opening {
    name: string;
    pgn: string;
    plyCount: number;
  }

  const OPENINGS_CSV_PATH = "/openings/openings.csv";
  // Columns: eco-volume,eco,name,pgn,... The name is quoted when it contains commas.
  const CSV_ROW = /^[^,]*,[^,]*,(?:"([^"]*)"|([^,]*)),([^,]*)/;

  // Every prefix of every opening's moves ("e4", "e4 e5", ...) -> the shortest opening that starts with it.
  // Empty until load() is done (or if it failed).
  let openingByPrefix = new Map<string, Opening>();
  let loadPromise: Promise<void> | null = null;

  /** Fetches the book. Safe to call many times; never rejects. */
  export function load(): Promise<void> {
    loadPromise ??= fetchOpenings().then(indexOpenings, function logFailure(error) {
      console.error("Failed to load openings book", error);
    });
    return loadPromise;
  }

  /** True if the moves are the beginning of some known opening. Always false before load() is done. */
  export function isKnownMovePath(sanMoves: readonly string[]): boolean {
    return openingByPrefix.has(sanMoves.join(" "));
  }

  /** The opening matching the longest prefix of the moves, or null if none matches. */
  export async function getOpeningBySanMoves(sanMoves: readonly string[]): Promise<Opening | null> {
    await load();
    for (let length = sanMoves.length; length >= 1; length -= 1) {
      const opening = openingByPrefix.get(sanMoves.slice(0, length).join(" "));
      if (opening) return { ...opening };
    }
    return null;
  }

  async function fetchOpenings(): Promise<Opening[]> {
    const response = await fetch(OPENINGS_CSV_PATH);
    if (!response.ok) throw new Error(`Failed to fetch ${OPENINGS_CSV_PATH}`);

    const openings: Opening[] = [];
    for (const line of (await response.text()).split(/\r?\n/).slice(1)) {
      const match = CSV_ROW.exec(line);
      const name = (match?.[1] ?? match?.[2])?.trim();
      const pgn = match?.[3].trim();
      if (name && pgn) openings.push({ name, pgn, plyCount: toSanMoves(pgn).length });
    }
    return openings;
  }

  // Opening PGNs are plain SAN move text ("1. e4 e5 2. Nf3"), so no chess.js parsing is needed.
  function toSanMoves(pgn: string): string[] {
    return pgn
      .replace(/\d+\.+/g, " ")
      .split(/\s+/)
      .filter(Boolean);
  }

  function indexOpenings(openings: Opening[]): void {
    const index = new Map<string, Opening>();
    for (const opening of openings) {
      const sanMoves = toSanMoves(opening.pgn);
      for (let length = 1; length <= sanMoves.length; length += 1) {
        const key = sanMoves.slice(0, length).join(" ");
        const previous = index.get(key);
        if (!previous || isPreferred(opening, previous)) index.set(key, opening);
      }
    }
    openingByPrefix = index;
  }

  // Shorter openings win, ties are broken by name.
  function isPreferred(candidate: Opening, current: Opening): boolean {
    if (candidate.plyCount !== current.plyCount) return candidate.plyCount < current.plyCount;
    return candidate.name.localeCompare(current.name) < 0;
  }
}
