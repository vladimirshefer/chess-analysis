export namespace OpeningsBook {
  interface OpeningEntry {
    epd?: string;
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

  let knownPositionEpdsPromise: Promise<Set<string>> | null = null;

  export function toEpd(fen: string): string {
    return fen.trim().split(/\s+/).slice(0, 4).join(" ");
  }

  export async function getKnownPositionEpds(): Promise<ReadonlySet<string>> {
    if (!knownPositionEpdsPromise) {
      knownPositionEpdsPromise = loadKnownPositionEpds();
    }

    return knownPositionEpdsPromise;
  }

  export async function isKnownPosition(fen: string): Promise<boolean> {
    const knownEpds = await getKnownPositionEpds();
    return knownEpds.has(toEpd(fen));
  }

  async function loadKnownPositionEpds(): Promise<Set<string>> {
    try {
      const openingLists = await Promise.all(OPENINGS_FILE_PATHS.map(loadOpeningEntries));
      const allOpenings = openingLists.flat();
      const knownEpds = new Set<string>();

      for (const opening of allOpenings) {
        const epd = opening.epd?.trim();
        if (!epd) continue;
        knownEpds.add(epd);
      }

      return knownEpds;
    } catch (error) {
      console.error("Failed to load openings book", error);
      return new Set<string>();
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
}
