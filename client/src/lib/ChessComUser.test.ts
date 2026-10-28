import { describe, expect, it } from "vitest";
import type { ChessComClient } from "./ChessComClient.ts";
import { ChessComUser } from "./ChessComUser.ts";

describe("ChessComUser", function suite() {
  it("returns board orientation from the player's side", function testCase() {
    const game = createGame({
      whiteUsername: "white-player",
      blackUsername: "black-player",
    });

    expect(ChessComUser.getInitialBoardOrientation(game, "white-player")).toBe("white");
    expect(ChessComUser.getInitialBoardOrientation(game, "black-player")).toBe("black");
  });

  it("finds the first game of the stored username in a newest-first list", function testCase() {
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
            id: "other-user",
            endTime: 1_700_000_300,
            whiteUsername: "someone-else",
            blackUsername: "another-player",
          }),
          latestGame,
          createGame({
            id: "older",
            endTime: 1_700_000_100,
            whiteUsername: "opponent-a",
            blackUsername: "vladimir",
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
