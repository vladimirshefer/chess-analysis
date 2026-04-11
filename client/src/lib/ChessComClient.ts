export namespace ChessComClient {
  const DEFAULT_LIMIT = 10;

  export async function getRecentGames(
    username: string,
    limit: number = DEFAULT_LIMIT,
  ): Promise<Dto.ChessComRecentGames> {
    if (import.meta.env.DEV) {
      return getRecentGamesDirect(username, limit);
    }

    return getRecentGamesViaProxy(username, limit);
  }

  async function getRecentGamesViaProxy(
    username: string,
    limit: number,
  ): Promise<Dto.ChessComRecentGames> {
    const normalizedUsername = username.trim().toLowerCase();
    const response = await fetch(
      `/api/chesscom/player/${encodeURIComponent(normalizedUsername)}/games?limit=${limit}`,
    );
    const payload =
      await parseResponse<Dto.ChessComRecentGamesResponse>(response);
    return payload;
  }

  async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    return parseResponse<T>(response);
  }

  async function parseResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      throw await toChessComError(response);
    }

    return response.json() as Promise<T>;
  }

  async function toChessComError(response: Response): Promise<Error> {
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
  async function collectRecentGames(
    archiveUrls: string[],
    limit: number,
  ): Promise<Dto.ChessComGameSummary[]> {
    const recentGames: Dto.ChessComGameSummary[] = [];

    for (let index = archiveUrls.length - 1; index >= 0; index -= 1) {
      const archiveUrl = archiveUrls[index];
      const archive = await fetchJson<Dto.ChessComArchiveResponse>(archiveUrl);
      const archiveGames = (archive.games ?? [])
        .slice()
        .reverse()
        .map(function mapGame(game) {
          return normalizeGame(game);
        })
        .filter(function filterGame(game): game is Dto.ChessComGameSummary {
          return game !== null;
        });

      recentGames.push(...archiveGames);
      if (recentGames.length >= limit) break;
    }

    return recentGames.slice(0, limit);
  }

  function normalizeGame(
    game: Dto.ChessComArchiveGameResponse,
  ): Dto.ChessComGameSummary | null {
    if (
      !game.url ||
      !game.pgn ||
      !game.white?.username ||
      !game.black?.username
    )
      return null;

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

  async function getRecentGamesDirect(
    username: string,
    limit: number,
  ): Promise<Dto.ChessComRecentGames> {
    const normalizedUsername = username.trim().toLowerCase();
    const player = await fetchJson<Dto.ChessComPlayerResponse>(
      `https://api.chess.com/pub/player/${encodeURIComponent(normalizedUsername)}`,
    );
    const archivesResponse = await fetchJson<Dto.ChessComArchivesResponse>(
      `https://api.chess.com/pub/player/${encodeURIComponent(normalizedUsername)}/games/archives`,
    );
    const games = await collectRecentGames(
      archivesResponse.archives ?? [],
      limit,
    );

    return {
      player: {
        username: player.username,
        url: player.url,
        avatar: player.avatar,
      },
      games,
    };
  }

  export namespace Dto {
    export interface ChessComPlayerSummary {
      username: string;
      url: string;
      avatar?: string;
    }

    export interface ChessComGamePlayer {
      username: string;
      rating?: number;
      result?: string;
    }

    export interface ChessComGameAccuracies {
      white?: number;
      black?: number;
    }

    export interface ChessComGameSummary {
      id: string;
      url: string;
      pgn: string;
      endTime: number | null;
      timeClass: string;
      timeControl: string;
      white: ChessComGamePlayer;
      black: ChessComGamePlayer;
      accuracies?: ChessComGameAccuracies;
    }

    export interface ChessComRecentGames {
      player: ChessComPlayerSummary;
      games: ChessComGameSummary[];
    }

    export interface ChessComPlayerResponse {
      username: string;
      url: string;
      avatar?: string;
    }

    export interface ChessComArchivesResponse {
      archives: string[];
    }

    export interface ChessComArchiveGameResponse {
      url?: string;
      pgn?: string;
      end_time?: number;
      time_class?: string;
      time_control?: string;
      white?: {
        username?: string;
        rating?: number;
        result?: string;
      };
      black?: {
        username?: string;
        rating?: number;
        result?: string;
      };
      accuracies?: {
        white?: number;
        black?: number;
      };
    }

    export interface ChessComArchiveResponse {
      games?: ChessComArchiveGameResponse[];
    }

    export interface ChessComRecentGamesResponse {
      player: ChessComPlayerSummary;
      games: ChessComGameSummary[];
    }
  }
}
