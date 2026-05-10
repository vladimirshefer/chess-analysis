import type { ChessComClient } from "./ChessComClient.ts";

export interface PlayerInfo {
  name?: string;
  rating?: number;
}

export interface GamePlayersInfo {
  white: PlayerInfo | null;
  black: PlayerInfo | null;
}

export function toGamePlayersInfoFromChessComGame(game: ChessComClient.Dto.ChessComGameSummary): GamePlayersInfo {
  return {
    white: {
      name: game.white.username,
      rating: game.white.rating,
    },
    black: {
      name: game.black.username,
      rating: game.black.rating,
    },
  };
}
