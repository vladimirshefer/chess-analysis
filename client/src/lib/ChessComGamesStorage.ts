import { ChessComClient } from "./ChessComClient.ts";

export namespace ChessComGamesStorage {
  const STORAGE_KEY = "chess-com-games-library-v1";

  export type ChessComGameEntity = ChessComClient.Dto.ChessComGameSummary;

  export interface ChessComGameRepository {
    get(id: string): ChessComGameEntity | null;
    save(entity: ChessComGameEntity): ChessComGameEntity;
    update(entity: ChessComGameEntity): ChessComGameEntity;
    getAll(): ChessComGameEntity[];
    delete(id: string): void;
  }

  export class LocalStorageChessComGameRepository implements ChessComGameRepository {
    get(id: string): ChessComGameEntity | null {
      if (!id) return null;
      const entitiesById = readEntitiesById();
      return entitiesById[id] ?? null;
    }

    save(entity: ChessComGameEntity): ChessComGameEntity {
      return upsertEntity(entity);
    }

    update(entity: ChessComGameEntity): ChessComGameEntity {
      return upsertEntity(entity);
    }

    getAll(): ChessComGameEntity[] {
      return Object.values(readEntitiesById());
    }

    delete(id: string): void {
      if (!id) return;
      const entitiesById = readEntitiesById();
      if (!entitiesById[id]) return;
      delete entitiesById[id];
      writeEntitiesById(entitiesById);
    }
  }

  export const sharedRepository: ChessComGameRepository = new LocalStorageChessComGameRepository();

  export function load(): ChessComClient.Dto.ChessComGameSummary[] {
    return sharedRepository.getAll();
  }

  export function save(game: ChessComClient.Dto.ChessComGameSummary): void {
    sharedRepository.save(game);
  }

  function upsertEntity(entity: ChessComGameEntity): ChessComGameEntity {
    const entityId = entity.id;
    if (!entityId) return entity;

    const entitiesById = readEntitiesById();
    entitiesById[entityId] = entity;
    writeEntitiesById(entitiesById);
    return entity;
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
