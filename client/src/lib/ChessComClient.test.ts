import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChessComClient } from "./ChessComClient.ts";

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

    const game = await ChessComClient.getGameById("hikaru", "123456");
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

    const game = await ChessComClient.findGameByOpponentAndDate("hikaru", "magnus", "2026-08-22");
    expect(game.id).toBe("https://www.chess.com/game/live/999888");
    expect(game.white.username).toBe("magnus");
    expect(game.black.username).toBe("hikaru");
  });
});
