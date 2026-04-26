import { ChessComClient } from "./ChessComClient.ts";

export namespace ChessComUser {
  const USERNAME_STORAGE_KEY = "chess-com-username";

  export function loadUsername(): string | null {
    const username = globalThis.localStorage.getItem(USERNAME_STORAGE_KEY)?.trim();
    return username ? username : null;
  }

  export function saveUsername(username: string): void {
    const normalizedUsername = normalizeUsername(username);
    if (!normalizedUsername) {
      globalThis.localStorage.removeItem(USERNAME_STORAGE_KEY);
      return;
    }
    globalThis.localStorage.setItem(USERNAME_STORAGE_KEY, normalizedUsername);
  }

  export function getInitialBoardOrientation(
    game: ChessComClient.Dto.ChessComGameSummary,
    username: string | null,
  ): "white" | "black" {
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
    return games.filter((game) => isParticipant(game, username)).sort(compareGameByEndTimeDesc)[0] ?? null;
  }

  function normalizeUsername(username: string | null | undefined): string {
    return username?.trim().toLowerCase() ?? "";
  }

  function compareGameByEndTimeDesc(
    left: ChessComClient.Dto.ChessComGameSummary,
    right: ChessComClient.Dto.ChessComGameSummary,
  ): number {
    const leftEndTime = left.endTime ?? 0;
    const rightEndTime = right.endTime ?? 0;
    if (leftEndTime !== rightEndTime) return rightEndTime - leftEndTime;
    return right.id.localeCompare(left.id);
  }
}
