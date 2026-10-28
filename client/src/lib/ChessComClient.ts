export namespace ChessComClient {
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
