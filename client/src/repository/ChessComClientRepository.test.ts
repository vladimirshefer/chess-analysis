import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChessComClient } from "../lib/ChessComClient.ts";
import {
  chessComClientRepository,
  type ChessComGameEntity,
  chessComGameRepository,
} from "./ChessComClientRepository.ts";

describe("ChessComClient", function suite() {
  const originalFetch = globalThis.fetch;

  beforeEach(function setup() {
    vi.restoreAllMocks();
  });

  afterEach(function cleanup() {
    globalThis.fetch = originalFetch;
  });

  it("loads game by id from user archives", async function testCase() {
    const mockArchivesList: ChessComClient.Dto.ChessComArchivesResponse = {
      archives: ["https://api.chess.com/pub/player/hikaru/games/2026/08"],
    };

    const mockArchiveResponse: ChessComClient.Dto.ChessComArchiveResponse = {
      games: [
        {
          url: "https://www.chess.com/game/live/123456",
          uuid: "test-uuid-1",
          pgn: '[Event "Live Chess"]\n[Date "2026.08.22"]\n1. e4 e5 1-0',
          end_time: 1787421530,
          white: { username: "hikaru", rating: 3000, result: "win" },
          black: { username: "opponent", rating: 2800, result: "resigned" },
        },
      ],
    };

    globalThis.fetch = vi.fn(async function mockFetch(url: string | URL | Request) {
      const urlString = String(url);
      if (urlString.includes("/games/archives")) {
        return new Response(JSON.stringify(mockArchivesList), { status: 200 });
      }
      if (urlString.includes("/games/2026/08")) {
        return new Response(JSON.stringify(mockArchiveResponse), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    });

    const game = await chessComClientRepository.getGameById("hikaru", "123456");
    expect(game.id).toBe("https://www.chess.com/game/live/123456");
    expect(game.white.username).toBe("hikaru");
    expect(game.black.username).toBe("opponent");
  });

  it("finds game by opponent and date across archives", async function testCase() {
    const mockArchivesList: ChessComClient.Dto.ChessComArchivesResponse = {
      archives: ["https://api.chess.com/pub/player/hikaru/games/2026/08"],
    };

    const mockArchiveGames: ChessComClient.Dto.ChessComArchiveResponse = {
      games: [
        {
          url: "https://www.chess.com/game/live/999888",
          pgn: '[Event "Live Chess"]\n[Date "2026.08.22"]\n1. d4 d5 0-1',
          end_time: 1787421530,
          white: { username: "magnus", rating: 3100, result: "resigned" },
          black: { username: "hikaru", rating: 3200, result: "win" },
        },
      ],
    };

    globalThis.fetch = vi.fn(async function mockFetch(url: string | URL | Request) {
      const urlString = String(url);
      if (urlString.includes("/games/archives")) {
        return new Response(JSON.stringify(mockArchivesList), { status: 200 });
      }
      if (urlString.includes("/games/2026/08")) {
        return new Response(JSON.stringify(mockArchiveGames), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    });

    const game = await chessComClientRepository.findGameByOpponentAndDate("hikaru", "magnus", "2026-08-22");
    expect(game.id).toBe("https://www.chess.com/game/live/999888");
    expect(game.white.username).toBe("magnus");
    expect(game.black.username).toBe("hikaru");
  });
});

namespace CachedChessComClientRepositoryTest {
  const entriesByKey = new Map<string, string>();
  let shouldThrowOnSetItem = false;

  export function install(): void {
    entriesByKey.clear();
    shouldThrowOnSetItem = false;

    const storage: Storage = {
      getItem: function getItem(key: string): string | null {
        return entriesByKey.get(key) ?? null;
      },
      setItem: function setItem(key: string, value: string): void {
        if (shouldThrowOnSetItem) throw new Error("QuotaExceededError");
        entriesByKey.set(key, String(value));
      },
      removeItem: function removeItem(key: string): void {
        entriesByKey.delete(key);
      },
      clear: function clear(): void {
        entriesByKey.clear();
      },
      key: function key(index: number): string | null {
        return [...entriesByKey.keys()][index] ?? null;
      },
      get length(): number {
        return entriesByKey.size;
      },
    };

    Object.defineProperty(globalThis, "localStorage", {
      value: storage,
      configurable: true,
      writable: true,
    });
  }

  export function setRawValue(key: string, value: string): void {
    entriesByKey.set(key, value);
  }

  export function failOnSetItem(): void {
    shouldThrowOnSetItem = true;
  }
}

describe("ChessComGamesLibrary", function suite() {
  beforeEach(function setup() {
    CachedChessComClientRepositoryTest.install();
  });

  it("saves and loads games with dedupe by id", function testCase() {
    chessComGameRepository.save(createGame("game-1", "e4"));
    chessComGameRepository.save(createGame("game-2", "d4"));
    chessComGameRepository.save(createGame("game-1", "c4"));

    const loadedGames = chessComGameRepository.getAll().sort(compareGameIdAsc);

    expect(loadedGames).toHaveLength(2);
    expect(loadedGames[0].id).toBe("game-1");
    expect(loadedGames[0].pgn).toContain("c4");
    expect(loadedGames[1].id).toBe("game-2");
  });

  it("keeps previously cached games when a new one is saved", function testCase() {
    CachedChessComClientRepositoryTest.setRawValue(
      "chess-com-games-library-v1",
      JSON.stringify({
        "old-game": createGame("old-game", "Nf3"),
      }),
    );

    chessComGameRepository.save(createGame("new-game", "e4"));
    const loadedIds = chessComGameRepository
      .getAll()
      .map(function mapGame(game) {
        return game.id;
      })
      .sort();

    expect(loadedIds).toEqual(["new-game", "old-game"]);
  });

  it("returns all games newest first, ties by id descending", function testCase() {
    chessComGameRepository.save({ ...createGame("a", "e4"), endTime: 200 });
    chessComGameRepository.save({ ...createGame("b", "e4"), endTime: 300 });
    chessComGameRepository.save({ ...createGame("c", "e4"), endTime: 200 });
    chessComGameRepository.save({ ...createGame("d", "e4"), endTime: null });

    expect(chessComGameRepository.getAll().map((game) => game.id)).toEqual(["b", "c", "a", "d"]);
  });

  it("returns empty list when localStorage contains invalid json", function testCase() {
    CachedChessComClientRepositoryTest.setRawValue("chess-com-games-library-v1", "{");

    expect(chessComGameRepository.getAll()).toEqual([]);
  });

  it("serves recent games of a user from stored games, newest first, with limit", async function testCase() {
    chessComGameRepository.save({ ...createGame("old", "e4"), endTime: 100 });
    chessComGameRepository.save({ ...createGame("new", "d4"), endTime: 300 });
    chessComGameRepository.save({ ...createGame("mid", "c4"), endTime: 200 });
    chessComGameRepository.save({
      ...createGame("other", "e4"),
      white: { username: "x" },
      black: { username: "y" },
    });

    const all = await chessComGameRepository.getRecentGames("White-Player");
    expect(all.games.map((game) => game.id)).toEqual(["new", "mid", "old"]);
    expect(all.player.username).toBe("white-player");

    const limited = await chessComGameRepository.getRecentGames("white-player", 2);
    expect(limited.games.map((game) => game.id)).toEqual(["new", "mid"]);
  });

  it("finds a stored game by id for a participant only", async function testCase() {
    chessComGameRepository.save(createGame("game-1", "e4"));

    expect((await chessComGameRepository.getGameById("black-player", "game-1")).id).toBe("game-1");
    await expect(chessComGameRepository.getGameById("stranger", "game-1")).rejects.toThrow();
    await expect(chessComGameRepository.getGameById("black-player", "missing")).rejects.toThrow();
  });

  it("finds a stored game by opponent and date", async function testCase() {
    chessComGameRepository.save(createGame("game-1", "e4"));

    const found = await chessComGameRepository.findGameByOpponentAndDate("white-player", "Black-Player", "2023.11.14");
    expect(found.id).toBe("game-1");
    await expect(
      chessComGameRepository.findGameByOpponentAndDate("white-player", "black-player", "2023-11-15"),
    ).rejects.toThrow();
    await expect(
      chessComGameRepository.findGameByOpponentAndDate("white-player", "someone", "2023-11-14"),
    ).rejects.toThrow();
  });

  it("throws when localStorage write fails", function testCase() {
    CachedChessComClientRepositoryTest.failOnSetItem();

    expect(function executeSave() {
      chessComGameRepository.save(createGame("game-1", "e4"));
    }).toThrow("QuotaExceededError");
  });
});

function createGame(gameId: string, firstMoveSan: string): ChessComGameEntity {
  return {
    id: gameId,
    url: `https://www.chess.com/game/live/${gameId}`,
    pgn: `[Event "Live Chess"]\n1. ${firstMoveSan}`,
    endTime: 1_700_000_000,
    timeClass: "rapid",
    timeControl: "600",
    white: {
      username: "white-player",
      rating: 1500,
      result: "win",
    },
    black: {
      username: "black-player",
      rating: 1500,
      result: "checkmated",
    },
  };
}

function compareGameIdAsc(left: ChessComGameEntity, right: ChessComGameEntity): number {
  return left.id.localeCompare(right.id);
}
