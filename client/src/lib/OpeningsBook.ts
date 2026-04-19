import { Chess } from "chess.js";

export namespace OpeningsBook {
  interface OpeningEntry {
    name?: string;
    epd?: string;
    pgn?: string;
  }

  export interface Opening {
    name: string;
    epd: string | null;
    pgn: string;
    plyCount: number;
  }

  interface KnownOpeningsData {
    knownEpds: Set<string>;
    knownMovePathPrefixes: Set<string>;
    openingByMovePathPrefix: Map<string, Opening>;
    openingByEpd: Map<string, Opening>;
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

  export function isReady(): boolean {
    void getKnownOpeningsData();
    return !!knownOpeningsDataPromise;
  }

  export function toEpd(fen: string): string {
    return fen.trim().split(/\s+/).slice(0, 4).join(" ");
  }

  export function toMovePathKey(sanMoves: readonly string[]): string {
    return sanMoves.join(" ");
  }

  export async function getKnownPositionEpds(): Promise<ReadonlySet<string>> {
    const knownData = await getKnownOpeningsData();
    return knownData.knownEpds;
  }

  export function isKnownMovePathKey(movePathKey: string): boolean {
    return knownOpeningsData?.knownMovePathPrefixes.has(movePathKey) ?? false;
  }

  export async function isKnownPosition(fen: string): Promise<boolean> {
    const knownEpds = await getKnownPositionEpds();
    return knownEpds.has(toEpd(fen));
  }

  export function isKnownPositionByFen(fen: string): boolean {
    return knownOpeningsData?.knownEpds.has(toEpd(fen)) ?? false;
  }

  export async function getOpeningByFen(fen: string): Promise<Opening | null> {
    const knownData = await getKnownOpeningsData();
    return cloneOpening(knownData.openingByEpd.get(toEpd(fen)) ?? null);
  }

  export async function getOpeningByPgn(pgn: string): Promise<Opening | null> {
    const sanMoves = toMainlineMoves(pgn);
    if (sanMoves.length === 0) return null;

    const knownData = await getKnownOpeningsData();
    for (let index = sanMoves.length; index >= 1; index -= 1) {
      const movePathKey = toMovePathKey(sanMoves.slice(0, index));
      const opening = knownData.openingByMovePathPrefix.get(movePathKey);
      if (opening) return cloneOpening(opening);
    }

    // Keep transpositions: fallback to the closest known opening by position along this mainline.
    const lineEpds = toMainlineEpds(sanMoves);
    for (let index = lineEpds.length - 1; index >= 0; index -= 1) {
      const opening = knownData.openingByEpd.get(lineEpds[index]);
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
      const knownEpds = new Set<string>();
      const knownMovePathPrefixes = new Set<string>();
      const openingByMovePathPrefix = new Map<string, Opening>();
      const openingByEpd = new Map<string, Opening>();

      for (const openingEntry of allOpenings) {
        const epd = openingEntry.epd?.trim() ?? "";
        if (epd) {
          knownEpds.add(epd);
        }

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

        if (opening.epd) {
          upsertOpening(openingByEpd, opening.epd, opening);
        }
      }

      return {
        knownEpds,
        knownMovePathPrefixes,
        openingByMovePathPrefix,
        openingByEpd,
      };
    } catch (error) {
      console.error("Failed to load openings book", error);
      return {
        knownEpds: new Set<string>(),
        knownMovePathPrefixes: new Set<string>(),
        openingByMovePathPrefix: new Map<string, Opening>(),
        openingByEpd: new Map<string, Opening>(),
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

  function stripVariations(pgn: string): string {
    let depth = 0;
    let result = "";

    for (let index = 0; index < pgn.length; index += 1) {
      const char = pgn[index];
      if (char === "(") {
        depth += 1;
        continue;
      }
      if (char === ")") {
        depth = Math.max(0, depth - 1);
        continue;
      }
      if (depth === 0) {
        result += char;
      }
    }

    return result;
  }

  function toMainlineMoves(pgn: string): string[] {
    const value = pgn.trim();
    if (!value) return [];

    const withoutVariations = stripVariations(value);
    const directMoves = tryParseMovesWithChess(withoutVariations);
    if (directMoves.length > 0) return directMoves;

    const fallbackTokens = tokenizeSanMoves(withoutVariations);
    if (fallbackTokens.length === 0) return [];

    const chess = new Chess();
    const moves: string[] = [];
    for (const token of fallbackTokens) {
      try {
        const move = chess.move(token);
        if (!move) break;
        moves.push(move.san);
      } catch {
        break;
      }
    }

    return moves;
  }

  function tryParseMovesWithChess(pgn: string): string[] {
    try {
      const chess = new Chess();
      chess.loadPgn(pgn);
      return chess.history();
    } catch {
      return [];
    }
  }

  function toMainlineEpds(sanMoves: readonly string[]): string[] {
    const chess = new Chess();
    const epds: string[] = [];

    for (const sanMove of sanMoves) {
      try {
        const move = chess.move(sanMove);
        if (!move) break;
        epds.push(toEpd(chess.fen()));
      } catch {
        break;
      }
    }

    return epds;
  }

  function tokenizeSanMoves(pgn: string): string[] {
    return pgn
      .replace(/\{[^}]*\}/g, " ")
      .replace(/;[^\n\r]*/g, " ")
      .replace(/\$\d+/g, " ")
      .replace(/\d+\.(?:\.\.)?/g, " ")
      .replace(/\b(?:1-0|0-1|1\/2-1\/2|\*)\b/g, " ")
      .split(/\s+/)
      .map(function cleanToken(token) {
        return token.replace(/[!?]+/g, "");
      })
      .filter(Boolean);
  }

  function toOpening(openingEntry: OpeningEntry, sanMoves: string[]): Opening | null {
    const openingName = openingEntry.name?.trim();
    if (!openingName) return null;

    return {
      name: openingName,
      epd: openingEntry.epd?.trim() || null,
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
      epd: opening.epd,
      pgn: opening.pgn,
      plyCount: opening.plyCount,
    };
  }
}
