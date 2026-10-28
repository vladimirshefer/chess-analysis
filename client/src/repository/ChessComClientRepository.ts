import type { ChessComClient } from "../lib/ChessComClient.ts";
import { chessComGameRepository } from "./ChessComGamesRepository.ts";

const DEFAULT_LIMIT = 10;

export interface ChessComClientRepository {
  getRecentGames(username: string, limit?: number): Promise<ChessComClient.Dto.ChessComRecentGames>;
  getGameById(username: string, gameId: string): Promise<ChessComClient.Dto.ChessComGameSummary>;
  findGameByOpponentAndDate(
    username: string,
    opponent: string,
    date: string,
  ): Promise<ChessComClient.Dto.ChessComGameSummary>;
}

/**
 * Every game loaded from the Chess.com API is also saved to {@link chessComGameRepository}.
 */
export class HttpChessComClientRepository implements ChessComClientRepository {
  async getRecentGames(
    username: string,
    limit: number = DEFAULT_LIMIT,
  ): Promise<ChessComClient.Dto.ChessComRecentGames> {
    const result = import.meta.env.DEV
      ? await this.getRecentGamesDirect(username, limit)
      : await this.getRecentGamesViaProxy(username, limit);
    this.cacheGames(result.games);
    return result;
  }

  async getGameById(username: string, gameId: string): Promise<ChessComClient.Dto.ChessComGameSummary> {
    const normalizedUsername = username.trim().toLowerCase();
    const archivesResponse = await this.fetchJson<ChessComClient.Dto.ChessComArchivesResponse>(
      `https://api.chess.com/pub/player/${encodeURIComponent(normalizedUsername)}/games/archives`,
    );

    const archives = archivesResponse.archives ?? [];
    for (let index = archives.length - 1; index >= 0; index -= 1) {
      const archiveUrl = archives[index];
      const archive = await this.fetchJson<ChessComClient.Dto.ChessComArchiveResponse>(archiveUrl);
      const matched = (archive.games ?? []).find((game) => this.matchesGameId(game, gameId));
      if (matched) {
        const summary = this.normalizeGame(matched);
        if (summary) {
          this.cacheGames([summary]);
          return summary;
        }
      }
    }

    throw new Error("Game not found on Chess.com");
  }

  async findGameByOpponentAndDate(
    username: string,
    opponent: string,
    date: string,
  ): Promise<ChessComClient.Dto.ChessComGameSummary> {
    const normalizedUsername = username.trim().toLowerCase();
    const normalizedOpponent = opponent.trim().toLowerCase();
    const normalizedDate = date.trim();

    const archivesResponse = await this.fetchJson<ChessComClient.Dto.ChessComArchivesResponse>(
      `https://api.chess.com/pub/player/${encodeURIComponent(normalizedUsername)}/games/archives`,
    );

    const archives = archivesResponse.archives ?? [];
    for (let index = archives.length - 1; index >= 0; index -= 1) {
      const archiveUrl = archives[index];
      const archive = await this.fetchJson<ChessComClient.Dto.ChessComArchiveResponse>(archiveUrl);
      const games = archive.games ?? [];

      for (let gameIndex = games.length - 1; gameIndex >= 0; gameIndex -= 1) {
        const game = games[gameIndex];
        if (this.matchesOpponent(game, normalizedOpponent) && this.matchesDate(game, normalizedDate)) {
          const summary = this.normalizeGame(game);
          if (summary) {
            this.cacheGames([summary]);
            return summary;
          }
        }
      }
    }

    throw new Error("Game not found matching opponent and date");
  }

  private cacheGames(games: ChessComClient.Dto.ChessComGameSummary[]): void {
    try {
      for (const game of games) {
        chessComGameRepository.save(game);
      }
    } catch (error) {
      console.error("Failed to cache Chess.com games", error);
    }
  }

  private async getRecentGamesViaProxy(
    username: string,
    limit: number,
  ): Promise<ChessComClient.Dto.ChessComRecentGames> {
    const normalizedUsername = username.trim().toLowerCase();
    const response = await fetch(`/api/chesscom/player/${encodeURIComponent(normalizedUsername)}/games?limit=${limit}`);
    return this.parseResponse<ChessComClient.Dto.ChessComRecentGamesResponse>(response);
  }

  private async getRecentGamesDirect(username: string, limit: number): Promise<ChessComClient.Dto.ChessComRecentGames> {
    const normalizedUsername = username.trim().toLowerCase();
    const player = await this.fetchJson<ChessComClient.Dto.ChessComPlayerResponse>(
      `https://api.chess.com/pub/player/${encodeURIComponent(normalizedUsername)}`,
    );
    const archivesResponse = await this.fetchJson<ChessComClient.Dto.ChessComArchivesResponse>(
      `https://api.chess.com/pub/player/${encodeURIComponent(normalizedUsername)}/games/archives`,
    );
    const games = await this.collectRecentGames(archivesResponse.archives ?? [], limit);

    return {
      player: {
        username: player.username,
        url: player.url,
        avatar: player.avatar,
      },
      games,
    };
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    return this.parseResponse<T>(response);
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      throw await this.toChessComError(response);
    }

    return response.json() as Promise<T>;
  }

  private async toChessComError(response: Response): Promise<Error> {
    let message = "Unable to load Chess.com games";

    if (response.status === 404) {
      message = "Chess.com user not found";
    } else if (response.status === 429) {
      message = "Chess.com rate limit reached";
    } else {
      try {
        const payload = (await response.json()) as { message?: string };
        if (payload.message) message = payload.message;
      } catch {
        message = response.statusText || message;
      }
    }

    return new Error(message);
  }

  private async collectRecentGames(
    archiveUrls: string[],
    limit: number,
  ): Promise<ChessComClient.Dto.ChessComGameSummary[]> {
    const recentGames: ChessComClient.Dto.ChessComGameSummary[] = [];

    for (let index = archiveUrls.length - 1; index >= 0; index -= 1) {
      const archiveUrl = archiveUrls[index];
      const archive = await this.fetchJson<ChessComClient.Dto.ChessComArchiveResponse>(archiveUrl);
      const archiveGames = (archive.games ?? [])
        .slice()
        .reverse()
        .map((game) => this.normalizeGame(game))
        .filter((game): game is ChessComClient.Dto.ChessComGameSummary => game !== null);

      recentGames.push(...archiveGames);
      if (recentGames.length >= limit) break;
    }

    return recentGames.slice(0, limit);
  }

  private normalizeGame(
    game: ChessComClient.Dto.ChessComArchiveGameResponse,
  ): ChessComClient.Dto.ChessComGameSummary | null {
    if (!game.url || !game.pgn || !game.white?.username || !game.black?.username) return null;

    return {
      id: game.url,
      url: game.url,
      pgn: game.pgn,
      endTime: game.end_time ?? null,
      timeClass: game.time_class ?? "unknown",
      timeControl: game.time_control ?? "-",
      white: {
        username: game.white.username,
        rating: game.white.rating,
        result: game.white.result,
      },
      black: {
        username: game.black.username,
        rating: game.black.rating,
        result: game.black.result,
      },
      accuracies: game.accuracies
        ? {
            white: game.accuracies.white,
            black: game.accuracies.black,
          }
        : undefined,
    };
  }

  private matchesGameId(game: ChessComClient.Dto.ChessComArchiveGameResponse, gameId: string): boolean {
    if (!game.url) return false;
    return game.url.endsWith(`/${gameId}`) || game.url.includes(`/${gameId}`);
  }

  private matchesOpponent(game: ChessComClient.Dto.ChessComArchiveGameResponse, opponent: string): boolean {
    return game.white?.username?.toLowerCase() === opponent || game.black?.username?.toLowerCase() === opponent;
  }

  private matchesDate(game: ChessComClient.Dto.ChessComArchiveGameResponse, targetDate: string): boolean {
    if (game.end_time) {
      const d = new Date(game.end_time * 1000);
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(d.getUTCDate()).padStart(2, "0");
      if (targetDate === `${yyyy}-${mm}-${dd}` || targetDate === `${yyyy}.${mm}.${dd}`) return true;
    }
    if (game.pgn) {
      const dotDate = targetDate.replace(/[-/]/g, ".");
      const hyphenDate = targetDate.replace(/[./]/g, "-");
      if (game.pgn.includes(`[Date "${dotDate}"]`) || game.pgn.includes(`[UTCDate "${dotDate}"]`)) return true;
      if (game.pgn.includes(`[Date "${hyphenDate}"]`) || game.pgn.includes(`[UTCDate "${hyphenDate}"]`)) return true;
      if (game.pgn.includes(targetDate)) return true;
    }
    return false;
  }
}

export const chessComClientRepository: ChessComClientRepository = new HttpChessComClientRepository();