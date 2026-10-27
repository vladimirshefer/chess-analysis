import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const CSV = [
  "eco-volume,eco,name,pgn,uci,epd",
  "B,B00,King's Pawn,1. e4,e2e4,epd",
  'C,C20,"Open Game, Long Line",1. e4 e5 2. Nf3 Nc6,e2e4,epd',
  "C,C20,Open Game,1. e4 e5,e2e4 e7e5,epd",
  "C,C21,Zeta Variation,1. d4 d5 2. c4,d2d4,epd",
  "C,C21,Alpha Variation,1. d4 d5 2. c4,d2d4,epd",
  ",,,,,",
  "X,X00,No Moves,,,epd",
  "",
].join("\n");

async function importFreshBook(csv: string | null) {
  const fetchMock = vi.fn(async function fakeFetch() {
    return csv === null ? new Response("", { status: 404 }) : new Response(csv);
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.resetModules();
  const { OpeningsBook } = await import("./OpeningsBook.ts");
  return { OpeningsBook, fetchMock };
}

describe("OpeningsBook", function openingsBookSuite() {
  beforeEach(function silenceConsole() {
    vi.spyOn(console, "error").mockImplementation(function noop() {});
  });

  afterEach(function restoreGlobals() {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("isKnownMovePath", function isKnownMovePathSuite() {
    it("is false for everything before load() is done", async function beforeLoad() {
      const { OpeningsBook } = await importFreshBook(CSV);
      expect(OpeningsBook.isKnownMovePath(["e4"])).toBe(false);
    });

    it("is true for every prefix of a known opening", async function prefixes() {
      const { OpeningsBook } = await importFreshBook(CSV);
      await OpeningsBook.load();

      expect(OpeningsBook.isKnownMovePath(["e4"])).toBe(true);
      expect(OpeningsBook.isKnownMovePath(["e4", "e5"])).toBe(true);
      expect(OpeningsBook.isKnownMovePath(["e4", "e5", "Nf3"])).toBe(true);
      expect(OpeningsBook.isKnownMovePath(["e4", "e5", "Nf3", "Nc6"])).toBe(true);
    });

    it("is false for unknown, extended or out-of-order paths", async function unknownPaths() {
      const { OpeningsBook } = await importFreshBook(CSV);
      await OpeningsBook.load();

      expect(OpeningsBook.isKnownMovePath([])).toBe(false);
      expect(OpeningsBook.isKnownMovePath(["e4", "e5", "Nf3", "Nc6", "Bb5"])).toBe(false);
      expect(OpeningsBook.isKnownMovePath(["e5"])).toBe(false);
      expect(OpeningsBook.isKnownMovePath(["e5", "e4"])).toBe(false);
      expect(OpeningsBook.isKnownMovePath(["c4"])).toBe(false);
    });
  });

  describe("getOpeningBySanMoves", function getOpeningSuite() {
    it("returns null for empty and unknown moves", async function nullCases() {
      const { OpeningsBook } = await importFreshBook(CSV);

      expect(await OpeningsBook.getOpeningBySanMoves([])).toBeNull();
      expect(await OpeningsBook.getOpeningBySanMoves(["c4", "e5"])).toBeNull();
    });

    it("loads the book by itself if load() was not called", async function autoLoad() {
      const { OpeningsBook } = await importFreshBook(CSV);

      const opening = await OpeningsBook.getOpeningBySanMoves(["e4"]);

      expect(opening?.name).toBe("King's Pawn");
      expect(OpeningsBook.isKnownMovePath(["e4"])).toBe(true);
    });

    it("returns the opening for an exact match with name, pgn and plyCount", async function exactMatch() {
      const { OpeningsBook } = await importFreshBook(CSV);

      expect(await OpeningsBook.getOpeningBySanMoves(["e4", "e5"])).toEqual({
        name: "Open Game",
        pgn: "1. e4 e5",
        plyCount: 2,
      });
    });

    it("returns the opening of the longest known prefix when the game goes further", async function longestPrefix() {
      const { OpeningsBook } = await importFreshBook(CSV);

      const opening = await OpeningsBook.getOpeningBySanMoves(["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"]);

      expect(opening?.name).toBe("Open Game, Long Line");
    });

    it("prefers the shortest opening for a shared prefix", async function shortestWins() {
      const { OpeningsBook } = await importFreshBook(CSV);

      expect((await OpeningsBook.getOpeningBySanMoves(["e4"]))?.name).toBe("King's Pawn");
      expect((await OpeningsBook.getOpeningBySanMoves(["e4", "e5", "Nf3"]))?.name).toBe("Open Game, Long Line");
    });

    it("breaks ties by name", async function tieBreak() {
      const { OpeningsBook } = await importFreshBook(CSV);

      expect((await OpeningsBook.getOpeningBySanMoves(["d4", "d5", "c4"]))?.name).toBe("Alpha Variation");
    });

    it("returns a copy that can be mutated safely", async function returnsCopy() {
      const { OpeningsBook } = await importFreshBook(CSV);

      const first = await OpeningsBook.getOpeningBySanMoves(["e4"]);
      first!.name = "Changed";

      expect((await OpeningsBook.getOpeningBySanMoves(["e4"]))?.name).toBe("King's Pawn");
    });
  });

  describe("load", function loadSuite() {
    it("fetches the csv only once, however often it is called", async function fetchesOnce() {
      const { OpeningsBook, fetchMock } = await importFreshBook(CSV);

      await Promise.all([OpeningsBook.load(), OpeningsBook.load()]);
      await OpeningsBook.getOpeningBySanMoves(["e4"]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith("/openings/openings.csv");
    });

    it("skips rows without a name or without moves", async function skipsBrokenRows() {
      const { OpeningsBook } = await importFreshBook(CSV);
      await OpeningsBook.load();

      expect(await OpeningsBook.getOpeningBySanMoves(["No", "Moves"])).toBeNull();
      expect(OpeningsBook.isKnownMovePath([""])).toBe(false);
    });

    it("does not reject and leaves the book empty when the request fails", async function failedRequest() {
      const { OpeningsBook } = await importFreshBook(null);

      await expect(OpeningsBook.load()).resolves.toBeUndefined();

      expect(OpeningsBook.isKnownMovePath(["e4"])).toBe(false);
      expect(await OpeningsBook.getOpeningBySanMoves(["e4"])).toBeNull();
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe("real openings.csv", function realCsvSuite() {
    const realCsv = readFileSync(new URL("../../public/openings/openings.csv", import.meta.url), "utf8");

    it("knows common openings", async function commonOpenings() {
      const { OpeningsBook } = await importFreshBook(realCsv);
      await OpeningsBook.load();

      expect(OpeningsBook.isKnownMovePath(["e4", "e5", "Nf3", "Nc6", "Bb5"])).toBe(true);
      expect(OpeningsBook.isKnownMovePath(["a3", "a5", "b4"])).toBe(true);
      expect((await OpeningsBook.getOpeningBySanMoves(["e4", "e5", "Nf3", "Nc6", "Bb5"]))?.name).toMatch(/Ruy Lopez/);
    });

    it("reads quoted names that contain commas", async function quotedNames() {
      const { OpeningsBook } = await importFreshBook(realCsv);

      const opening = await OpeningsBook.getOpeningBySanMoves([
        "Nh3",
        "d5",
        "g3",
        "e5",
        "f4",
        "Bxh3",
        "Bxh3",
        "exf4",
        "O-O",
        "fxg3",
        "hxg3",
      ]);

      expect(opening?.name).toBe("Amar Opening: Paris Gambit, Gent Gambit");
    });
  });
});
