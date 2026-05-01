import type { ChessComClient } from "./ChessComClient.ts";

export interface PlayerInfo {
  name?: string;
  rating?: number;
}

export interface GamePlayersInfo {
  white: PlayerInfo | null;
  black: PlayerInfo | null;
}

export interface ImportedGameInfo {
  players: GamePlayersInfo;
  source: "pgn" | "chesscom";
}

export function mergePlayersInfo(
  base: GamePlayersInfo | null,
  override: GamePlayersInfo | null,
): GamePlayersInfo | null {
  return {
    white: {
      ...base?.white,
      ...override?.white,
    },
    black: {
      ...base?.black,
      ...override?.black,
    },
  };
}

export function toImportedGameInfoFromChessComGame(game: ChessComClient.Dto.ChessComGameSummary): ImportedGameInfo {
  return {
    source: "chesscom",
    players: {
      white: {
        name: game.white.username,
        rating: game.white.rating,
      },
      black: {
        name: game.black.username,
        rating: game.black.rating,
      },
    },
  };
}
