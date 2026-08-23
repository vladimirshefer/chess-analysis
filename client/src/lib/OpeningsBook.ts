export namespace OpeningsBook {
  interface OpeningEntry {
    name?: string;
    sanMoves?: string[];
  }

  export interface Opening {
    name: string;
    sanMoves: string[];
    plyCount: number;
  }

  interface KnownOpeningsData {
    knownMovePathPrefixes: Set<string>;
    openingByMovePathPrefix: Map<string, Opening>;
  }

  const OPENINGS_FILE_PATHS = [
    "/openings/openings-other.json",
    "/openings/openings-e4-e5-nf3.json",
    "/openings/openings-e4-e5.json",
    "/openings/openings-e4-c5.json",
    "/openings/openings-e4-other.json",
    "/openings/openings-d4-d5.json",
    "/openings/openings-d4-other.json",
  ] as const;

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
      const openingLists = await Promise.all(OPENINGS_FILE_PATHS.map(loadOpeningEntries));
      const allOpenings = openingLists.flat();
      const knownMovePathPrefixes = new Set<string>();
      const openingByMovePathPrefix = new Map<string, Opening>();

      for (const openingEntry of allOpenings) {
        const sanMoves = openingEntry.sanMoves ?? [];
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

  async function loadOpeningEntries(path: string): Promise<OpeningEntry[]> {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to fetch openings file: ${path}`);
    }

    const data = (await response.json()) as unknown;
    return Array.isArray(data) ? (data as OpeningEntry[]) : [];
  }

  function toOpening(openingEntry: OpeningEntry, sanMoves: string[]): Opening | null {
    const openingName = openingEntry.name?.trim();
    if (!openingName) return null;

    return {
      name: openingName,
      sanMoves,
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
      sanMoves: [...opening.sanMoves],
      plyCount: opening.plyCount,
    };
  }
}
