import type { ChessComClient } from "../lib/ChessComClient.ts";
import { ChessComUser } from "../lib/ChessComUser.ts";
import type { ChessComClientRepository } from "./ChessComClientRepository.ts";

export type ChessComGameEntity = ChessComClient.Dto.ChessComGameSummary;

/**
 * Besides CRUD, it serves the {@link ChessComClientRepository} queries from the stored (offline) games only.
 */
export interface ChessComGameRepository extends ChessComClientRepository {
  get(id: string): ChessComGameEntity | null;
  save(entity: ChessComGameEntity): ChessComGameEntity;
  /** Returns all stored games, newest first. */
  getAll(): ChessComGameEntity[];
  delete(id: string): void;
}

export namespace ChessComGamesStorage {
  const STORAGE_KEY = "chess-com-games-library-v1";

  export class LocalStorageChessComGameRepository implements ChessComGameRepository {
    get(id: string): ChessComGameEntity | null {
      if (!id) return null;
      const entitiesById = readEntitiesById();
      return entitiesById[id] ?? null;
    }

    save(entity: ChessComGameEntity): ChessComGameEntity {
      const entityId = entity.id;
      if (!entityId) return entity;

      const entitiesById = readEntitiesById();
      entitiesById[entityId] = entity;
      writeEntitiesById(entitiesById);
      return entity;
    }

    getAll(): ChessComGameEntity[] {
      return Object.values(readEntitiesById()).sort(compareGamesByEndTimeDesc);
    }

    delete(id: string): void {
      if (!id) return;
      const entitiesById = readEntitiesById();
      if (!entitiesById[id]) return;
      delete entitiesById[id];
      writeEntitiesById(entitiesById);
    }

    async getRecentGames(username: string, limit?: number): Promise<ChessComClient.Dto.ChessComRecentGames> {
      const games = this.getAll()
        .filter((game) => ChessComUser.isParticipant(game, username))
        .slice(0, limit);
      const normalizedUsername = username.trim().toLowerCase();
      const player = games
        .flatMap((game) => [game.white, game.black])
        .find((candidate) => candidate.username.toLowerCase() === normalizedUsername);
      const displayName = player?.username ?? normalizedUsername;
      return {
        player: { username: displayName, url: `https://www.chess.com/member/${displayName}` },
        games,
      };
    }

    async getGameById(username: string, gameId: string): Promise<ChessComGameEntity> {
      const game = this.getAll().find(
        (candidate) => ChessComUser.isParticipant(candidate, username) && candidate.url.includes(`/${gameId}`),
      );
      if (!game) throw new Error("Game not found in stored games");
      return game;
    }

    async findGameByOpponentAndDate(username: string, opponent: string, date: string): Promise<ChessComGameEntity> {
      const normalizedOpponent = opponent.trim().toLowerCase();
      const normalizedDate = date.trim().replace(/[./]/g, "-");
      const { games } = await this.getRecentGames(username);
      const game = games.find(
        (candidate) =>
          [candidate.white.username, candidate.black.username].some(
            (name) => name.toLowerCase() === normalizedOpponent,
          ) && toIsoDate(candidate) === normalizedDate,
      );
      if (!game) throw new Error("Game not found matching opponent and date");
      return game;
    }
  }

  function compareGamesByEndTimeDesc(left: ChessComGameEntity, right: ChessComGameEntity): number {
    const leftEndTime = left.endTime ?? 0;
    const rightEndTime = right.endTime ?? 0;
    if (leftEndTime !== rightEndTime) return rightEndTime - leftEndTime;
    return right.id.localeCompare(left.id);
  }

  function toIsoDate(game: ChessComGameEntity): string | null {
    if (game.endTime) return new Date(game.endTime * 1000).toISOString().slice(0, 10);
    const pgnDate = /\[(?:UTC)?Date "(\d{4})\.(\d{2})\.(\d{2})"\]/.exec(game.pgn);
    return pgnDate ? `${pgnDate[1]}-${pgnDate[2]}-${pgnDate[3]}` : null;
  }

  function readEntitiesById(): Record<string, ChessComGameEntity> {
    const rawValue = globalThis.localStorage.getItem(STORAGE_KEY);
    if (!rawValue) return {};

    try {
      const parsed = JSON.parse(rawValue) as unknown;
      if (!isObjectRecord(parsed)) return {};

      const entitiesById: Record<string, ChessComGameEntity> = {};
      Object.entries(parsed).forEach(function collectEntry([key, value]) {
        if (!key) return;
        if (!isObjectRecord(value)) return;
        if (typeof value.id !== "string" || !value.id) return;
        entitiesById[key] = value as unknown as ChessComGameEntity;
      });
      return entitiesById;
    } catch {
      return {};
    }
  }

  function writeEntitiesById(entitiesById: Record<string, ChessComGameEntity>): void {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(entitiesById));
  }

  function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }
}

export const chessComGameRepository: ChessComGameRepository = new ChessComGamesStorage.LocalStorageChessComGameRepository();
