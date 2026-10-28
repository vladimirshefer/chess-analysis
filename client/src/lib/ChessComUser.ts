import type { ChessComClient } from "./ChessComClient.ts";
import { chessComUserRepository } from "../repository/ChessComUserRepository.ts";
import type { ChessComGameEntity } from "../repository/ChessComClientRepository.ts";

export namespace ChessComUser {
  export function getInitialBoardOrientation(game: ChessComGameEntity, username: string | null): "white" | "black" {
    const normalizedUsername = normalizeUsername(username);
    if (!normalizedUsername) return "white";
    if (normalizeUsername(game.black.username) === normalizedUsername) return "black";
    return "white";
  }

  export function isParticipant(game: ChessComClient.Dto.ChessComGameSummary, username: string | null): boolean {
    const normalizedUsername = normalizeUsername(username);
    if (!normalizedUsername) return false;
    return (
      normalizeUsername(game.white.username) === normalizedUsername ||
      normalizeUsername(game.black.username) === normalizedUsername
    );
  }

  export function findLatestGame(
    games: ChessComClient.Dto.ChessComGameSummary[],
    username: string | null,
  ): ChessComClient.Dto.ChessComGameSummary | null {
    return games.filter((game) => isParticipant(game, username))[0] ?? null;
  }

  export function toGameAnalysisUrl(game: ChessComClient.Dto.ChessComGameSummary, username?: string | null): string {
    const resolvedUsername =
      (username && normalizeUsername(username)) ||
      chessComUserRepository.get()?.username ||
      normalizeUsername(game.white.username);
    const gameId = game.url.split("/").filter(Boolean).pop() || game.id;
    return `/analysis/chesscom/user/${encodeURIComponent(resolvedUsername)}/game/${encodeURIComponent(gameId)}`;
  }

  function normalizeUsername(username: string | null | undefined): string {
    return username?.trim().toLowerCase() ?? "";
  }
}
