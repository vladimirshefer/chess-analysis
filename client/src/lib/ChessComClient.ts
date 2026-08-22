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

  async function getRecentGamesViaProxy(username: string, limit: number): Promise<Dto.ChessComRecentGames> {
    const normalizedUsername = username.trim().toLowerCase();
    const response = await fetch(`/api/chesscom/player/${encodeURIComponent(normalizedUsername)}/games?limit=${limit}`);
    const payload = await parseResponse<Dto.ChessComRecentGamesResponse>(response);
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
  async function collectRecentGames(archiveUrls: string[], limit: number): Promise<Dto.ChessComGameSummary[]> {
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

  function normalizeGame(game: Dto.ChessComArchiveGameResponse): Dto.ChessComGameSummary | null {
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

  async function getRecentGamesDirect(username: string, limit: number): Promise<Dto.ChessComRecentGames> {
    const normalizedUsername = username.trim().toLowerCase();
    const player = await fetchJson<Dto.ChessComPlayerResponse>(
      `https://api.chess.com/pub/player/${encodeURIComponent(normalizedUsername)}`,
    );
    const archivesResponse = await fetchJson<Dto.ChessComArchivesResponse>(
      `https://api.chess.com/pub/player/${encodeURIComponent(normalizedUsername)}/games/archives`,
    );
    const games = await collectRecentGames(archivesResponse.archives ?? [], limit);

    return {
      player: {
        username: player.username,
        url: player.url,
        avatar: player.avatar,
      },
      games,
    };
  }

  export async function getGameById(username: string, gameId: string): Promise<Dto.ChessComGameSummary> {
    const normalizedUsername = username.trim().toLowerCase();
    const archivesResponse = await fetchJson<Dto.ChessComArchivesResponse>(
      `https://api.chess.com/pub/player/${encodeURIComponent(normalizedUsername)}/games/archives`,
    );

    const archives = archivesResponse.archives ?? [];
    for (let index = archives.length - 1; index >= 0; index -= 1) {
      const archiveUrl = archives[index];
      const archive = await fetchJson<Dto.ChessComArchiveResponse>(archiveUrl);
      const matched = (archive.games ?? []).find(function match(game) {
        return matchesGameId(game, gameId);
      });
      if (matched) {
        const summary = normalizeGame(matched);
        if (summary) return summary;
      }
    }

    throw new Error("Game not found on Chess.com");
  }

  export async function findGameByOpponentAndDate(
    username: string,
    opponent: string,
    date: string,
  ): Promise<Dto.ChessComGameSummary> {
    const normalizedUsername = username.trim().toLowerCase();
    const normalizedOpponent = opponent.trim().toLowerCase();
    const normalizedDate = date.trim();

    const archivesResponse = await fetchJson<Dto.ChessComArchivesResponse>(
      `https://api.chess.com/pub/player/${encodeURIComponent(normalizedUsername)}/games/archives`,
    );

    const archives = archivesResponse.archives ?? [];
    for (let index = archives.length - 1; index >= 0; index -= 1) {
      const archiveUrl = archives[index];
      const archive = await fetchJson<Dto.ChessComArchiveResponse>(archiveUrl);
      const games = archive.games ?? [];

      for (let gameIndex = games.length - 1; gameIndex >= 0; gameIndex -= 1) {
        const game = games[gameIndex];
        if (matchesOpponent(game, normalizedOpponent) && matchesDate(game, normalizedDate)) {
          const summary = normalizeGame(game);
          if (summary) return summary;
        }
      }
    }

    throw new Error("Game not found matching opponent and date");
  }

  function matchesGameId(game: Dto.ChessComArchiveGameResponse, gameId: string): boolean {
    if (!game.url) return false;
    return game.url.endsWith(`/${gameId}`) || game.url.includes(`/${gameId}`);
  }

  function matchesOpponent(game: Dto.ChessComArchiveGameResponse, opponent: string): boolean {
    return game.white?.username?.toLowerCase() === opponent || game.black?.username?.toLowerCase() === opponent;
  }

  function matchesDate(game: Dto.ChessComArchiveGameResponse, targetDate: string): boolean {
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
      uuid?: string;
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

    export interface ChessComCallbackResponse {
      game?: {
        id?: number | string;
        uuid?: string;
        endTime?: number;
        pgnHeaders?: {
          Date?: string;
          White?: string;
          Black?: string;
        };
      };
      players?: {
        top?: { username?: string };
        bottom?: { username?: string };
      };
    }
  }
}
