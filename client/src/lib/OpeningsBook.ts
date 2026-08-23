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

  const OTHER_PATH = "/openings/openings-other.json";
  const E4_E5_NF3_PATH = "/openings/openings-e4-e5-nf3.json";
  const E4_E5_PATH = "/openings/openings-e4-e5.json";
  const E4_C5_PATH = "/openings/openings-e4-c5.json";
  const E4_OTHER_PATH = "/openings/openings-e4-other.json";
  const D4_D5_PATH = "/openings/openings-d4-d5.json";
  const D4_OTHER_PATH = "/openings/openings-d4-other.json";

  const knownMovePathPrefixes = new Set<string>();
  const openingByMovePathPrefix = new Map<string, Opening>();
  const loadedShardPaths = new Set<string>();
  const shardLoadPromises = new Map<string, Promise<void>>();

  export function toMovePathKey(sanMoves: readonly string[]): string {
    return sanMoves.join(" ");
  }

  export async function ensureLoadedForMoves(sanMoves: readonly string[]): Promise<void> {
    if (sanMoves.length === 0) return;

    const shardPaths = resolveShardPathsForMoves(sanMoves);
    await Promise.all(shardPaths.map(loadShard));
  }

  export function isKnownMovePath(sanMoves: readonly string[]): boolean {
    const movePathKey = toMovePathKey(sanMoves);
    return knownMovePathPrefixes.has(movePathKey);
  }

  export async function getOpeningBySanMoves(sanMoves: readonly string[]): Promise<Opening | null> {
    if (sanMoves.length === 0) return null;

    await ensureLoadedForMoves(sanMoves);
    let opening = findOpeningByMovePath(sanMoves);

    if (!opening) {
      const fallbackShardPath = resolveFallbackShardPathForMoves(sanMoves);
      if (fallbackShardPath && !loadedShardPaths.has(fallbackShardPath)) {
        await loadShard(fallbackShardPath);
        opening = findOpeningByMovePath(sanMoves);
      }
    }

    return cloneOpening(opening);
  }

  function findOpeningByMovePath(sanMoves: readonly string[]): Opening | null {
    for (let index = sanMoves.length; index >= 1; index -= 1) {
      const movePathKey = toMovePathKey(sanMoves.slice(0, index));
      const opening = openingByMovePathPrefix.get(movePathKey);
      if (opening) return opening;
    }

    return null;
  }

  function resolveShardPathsForMoves(sanMoves: readonly string[]): string[] {
    const firstMove = sanMoves[0];

    if (firstMove === "e4") {
      const secondMove = sanMoves[1];
      if (secondMove === "e5") {
        const thirdMove = sanMoves[2];
        return thirdMove === "Nf3" ? [E4_E5_NF3_PATH, E4_E5_PATH] : [E4_E5_PATH];
      }
      if (secondMove === "c5") return [E4_C5_PATH];
      return [E4_OTHER_PATH];
    }

    if (firstMove === "d4") {
      const secondMove = sanMoves[1];
      return secondMove === "d5" ? [D4_D5_PATH] : [D4_OTHER_PATH];
    }

    return [OTHER_PATH];
  }

  function resolveFallbackShardPathForMoves(sanMoves: readonly string[]): string | null {
    const firstMove = sanMoves[0];

    if (firstMove === "e4") return E4_OTHER_PATH;
    if (firstMove === "d4") return D4_OTHER_PATH;
    return null;
  }

  function loadShard(path: string): Promise<void> {
    if (loadedShardPaths.has(path)) return Promise.resolve();

    let shardLoadPromise = shardLoadPromises.get(path);
    if (!shardLoadPromise) {
      shardLoadPromise = loadOpeningEntries(path)
        .then(function indexShardEntries(entries) {
          mergeEntriesIntoIndex(entries);
          loadedShardPaths.add(path);
        })
        .catch(function handleShardLoadError(error) {
          console.error(`Failed to load openings shard: ${path}`, error);
          shardLoadPromises.delete(path);
        });
      shardLoadPromises.set(path, shardLoadPromise);
    }

    return shardLoadPromise;
  }

  function mergeEntriesIntoIndex(openingEntries: OpeningEntry[]): void {
    for (const openingEntry of openingEntries) {
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
