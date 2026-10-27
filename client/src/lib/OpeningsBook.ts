export namespace OpeningsBook {
  interface OpeningEntry {
    name?: string;
    pgn?: string;
  }

  export interface Opening {
    name: string;
    pgn: string;
    plyCount: number;
  }

  interface KnownOpeningsData {
    knownMovePathPrefixes: Set<string>;
    openingByMovePathPrefix: Map<string, Opening>;
  }

  const OPENINGS_CSV_PATH = "/openings/openings.csv";

  let knownOpeningsDataPromise: Promise<KnownOpeningsData> | null = null;
  let knownOpeningsData: KnownOpeningsData | null = null;

  export function toMovePathKey(sanMoves: readonly string[]): string {
    return sanMoves.join(" ");
  }

  export async function load(): Promise<void> {
    await getKnownOpeningsData();
  }

  export function isKnownMovePath(sanMoves: readonly string[]): boolean {
    const movePathKey = toMovePathKey(sanMoves);
    return knownOpeningsData?.knownMovePathPrefixes.has(movePathKey) ?? false;
  }

  export async function getOpeningBySanMoves(sanMoves: readonly string[]): Promise<Opening | null> {
    if (sanMoves.length === 0) return null;

    const knownData = await getKnownOpeningsData();
    for (let index = sanMoves.length; index >= 1; index -= 1) {
      const movePathKey = toMovePathKey(sanMoves.slice(0, index));
      const opening = knownData.openingByMovePathPrefix.get(movePathKey);
      if (opening) return cloneOpening(opening);
    }

    return null;
  }

  async function getKnownOpeningsData(): Promise<KnownOpeningsData> {
    if (knownOpeningsData) {
      return knownOpeningsData;
    }

    if (!knownOpeningsDataPromise) {
      knownOpeningsDataPromise = loadKnownOpeningsData().then(function cacheKnownOpeningsData(data) {
        knownOpeningsData = data;
        return data;
      });
    }

    return knownOpeningsDataPromise;
  }

  async function loadKnownOpeningsData(): Promise<KnownOpeningsData> {
    try {
      const allOpenings = await loadOpeningEntries();
      const knownMovePathPrefixes = new Set<string>();
      const openingByMovePathPrefix = new Map<string, Opening>();

      for (const openingEntry of allOpenings) {
        const sanMoves = toMainlineMoves(openingEntry.pgn ?? "");
        for (let index = 0; index < sanMoves.length; index += 1) {
          const movePathPrefix = toMovePathKey(sanMoves.slice(0, index + 1));
          knownMovePathPrefixes.add(movePathPrefix);
        }

        const opening = toOpening(openingEntry, sanMoves);
        if (!opening) continue;

        for (let index = 0; index < sanMoves.length; index += 1) {
          const movePathPrefix = toMovePathKey(sanMoves.slice(0, index + 1));
          upsertOpening(openingByMovePathPrefix, movePathPrefix, opening);
        }
      }

      return {
        knownMovePathPrefixes,
        openingByMovePathPrefix,
      };
    } catch (error) {
      console.error("Failed to load openings book", error);
      return {
        knownMovePathPrefixes: new Set<string>(),
        openingByMovePathPrefix: new Map<string, Opening>(),
      };
    }
  }

  async function loadOpeningEntries(): Promise<OpeningEntry[]> {
    const response = await fetch(OPENINGS_CSV_PATH);
    if (!response.ok) {
      throw new Error(`Failed to fetch openings file: ${OPENINGS_CSV_PATH}`);
    }

    const [header, ...lines] = (await response.text()).split(/\r?\n/).filter(Boolean);
    const columns = parseCsvLine(header);
    const nameIndex = columns.indexOf("name");
    const pgnIndex = columns.indexOf("pgn");
    return lines.map(function toEntry(line) {
      const row = parseCsvLine(line);
      return { name: row[nameIndex], pgn: row[pgnIndex] };
    });
  }

  function parseCsvLine(line: string): string[] {
    const values: string[] = [];
    let current = "";
    let insideQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"') {
        if (insideQuotes && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === "," && !insideQuotes) {
        values.push(current);
        current = "";
      } else {
        current += char;
      }
    }

    values.push(current);
    return values;
  }

  // Openings PGNs are plain SAN move text ("1. e4 e5 2. Nf3"), so no chess.js parsing is needed.
  function toMainlineMoves(pgn: string): string[] {
    return pgn
      .replace(/\d+\.+/g, " ")
      .split(/\s+/)
      .filter(Boolean);
  }

  function toOpening(openingEntry: OpeningEntry, sanMoves: string[]): Opening | null {
    const openingName = openingEntry.name?.trim();
    if (!openingName) return null;

    return {
      name: openingName,
      pgn: openingEntry.pgn?.trim() ?? "",
      plyCount: sanMoves.length,
    };
  }

  function upsertOpening(openingsByKey: Map<string, Opening>, key: string, opening: Opening): void {
    const previousOpening = openingsByKey.get(key);
    if (!previousOpening) {
      openingsByKey.set(key, opening);
      return;
    }

    if (isPreferredOpening(previousOpening, opening)) {
      openingsByKey.set(key, opening);
    }
  }

  function isPreferredOpening(previousOpening: Opening, nextOpening: Opening): boolean {
    if (nextOpening.plyCount < previousOpening.plyCount) return true;
    if (nextOpening.plyCount > previousOpening.plyCount) return false;
    return nextOpening.name.localeCompare(previousOpening.name) < 0;
  }

  function cloneOpening(opening: Opening | null): Opening | null {
    if (!opening) return null;

    return {
      name: opening.name,
      pgn: opening.pgn,
      plyCount: opening.plyCount,
    };
  }
}
