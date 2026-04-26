import { beforeEach, describe, expect, it } from "vitest";
import { ChessComClient } from "./ChessComClient.ts";
import { ChessComUser } from "./ChessComUser.ts";

namespace LocalStorageTestMock {
  const entriesByKey = new Map<string, string>();

  export function install(): void {
    entriesByKey.clear();

    const storage: Storage = {
      getItem: function getItem(key: string): string | null {
        return entriesByKey.get(key) ?? null;
      },
      setItem: function setItem(key: string, value: string): void {
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
}

describe("ChessComUser", function suite() {
  beforeEach(function setup() {
    LocalStorageTestMock.install();
  });

  it("loads and saves normalized username", function testCase() {
    ChessComUser.saveUsername("  Vladimir  ");

    expect(ChessComUser.loadUsername()).toBe("vladimir");
  });

  it("returns board orientation from the player's side", function testCase() {
    const game = createGame({
      whiteUsername: "white-player",
      blackUsername: "black-player",
    });

    expect(ChessComUser.getInitialBoardOrientation(game, "white-player")).toBe("white");
    expect(ChessComUser.getInitialBoardOrientation(game, "black-player")).toBe("black");
  });

  it("finds the newest game for the stored username", function testCase() {
    const latestGame = createGame({
      id: "latest",
      endTime: 1_700_000_200,
      whiteUsername: "vladimir",
      blackUsername: "opponent-b",
    });

    expect(
      ChessComUser.findLatestGame(
        [
          createGame({
            id: "older",
            endTime: 1_700_000_100,
            whiteUsername: "opponent-a",
            blackUsername: "vladimir",
          }),
          latestGame,
          createGame({
            id: "other-user",
            endTime: 1_700_000_300,
            whiteUsername: "someone-else",
            blackUsername: "another-player",
          }),
        ],
        "vladimir",
      ),
    ).toEqual(latestGame);
  });
});

function createGame({
  id = "game-1",
  endTime = 1_700_000_000,
  whiteUsername,
  blackUsername,
}: {
  id?: string;
  endTime?: number;
  whiteUsername: string;
  blackUsername: string;
}): ChessComClient.Dto.ChessComGameSummary {
  return {
    id,
    url: `https://www.chess.com/game/live/${id}`,
    pgn: `[Event "Live Chess"]\n1. e4 e5`,
    endTime,
    timeClass: "rapid",
    timeControl: "600",
    white: {
      username: whiteUsername,
      rating: 1500,
      result: "win",
    },
    black: {
      username: blackUsername,
      rating: 1500,
      result: "checkmated",
    },
  };
}
