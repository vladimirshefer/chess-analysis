import { ChessComUser } from "../lib/ChessComUser.ts";

export interface ChessComUserEntity {
  username: string;
}

export interface ChessComUserRepository {
  /** Returns the current (most recently saved) user. */
  get(): ChessComUserEntity | null;
  /** Returns the user with the given username. */
  get(username: string): ChessComUserEntity | null;
  save(entity: ChessComUserEntity): ChessComUserEntity | null;
  update(entity: ChessComUserEntity): ChessComUserEntity | null;
  /** Returns all saved users, most recently saved first. The local profile is always listed, last unless saved. */
  getAll(): ChessComUserEntity[];
  /** Deletes all saved users. */
  delete(): void;
  /** Deletes the user with the given username. */
  delete(username: string): void;
}

export namespace ChessComUserStorage {
  const STORAGE_KEY = "chess-com-users";
  const LEGACY_STORAGE_KEY = "chess-com-username";

  export class LocalStorageChessComUserRepository implements ChessComUserRepository {
    get(): ChessComUserEntity | null;
    get(username: string): ChessComUserEntity | null;
    get(username?: string): ChessComUserEntity | null {
      if (username === undefined) return this.getAll()[0] ?? null;
      const normalized = normalize(username);
      return this.getAll().find((user) => user.username === normalized) ?? null;
    }

    /** Saves the user and moves it to the front of the list. */
    save(entity: ChessComUserEntity): ChessComUserEntity | null {
      const username = normalize(entity.username);
      if (!username) return null;
      writeAll([{ username }, ...readSaved().filter((user) => user.username !== username)]);
      return { username };
    }

    update(entity: ChessComUserEntity): ChessComUserEntity | null {
      return this.save(entity);
    }

    getAll(): ChessComUserEntity[] {
      const saved = readSaved();
      const hasLocal = saved.some((user) => ChessComUser.isLocal(user.username));
      return hasLocal ? saved : [...saved, { username: ChessComUser.LOCAL_USERNAME }];
    }

    delete(): void;
    delete(username: string): void;
    delete(username?: string): void {
      if (username === undefined) return writeAll([]);
      const normalized = normalize(username);
      writeAll(readSaved().filter((user) => user.username !== normalized));
    }
  }

  function readSaved(): ChessComUserEntity[] {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      const legacyUsername = normalize(globalThis.localStorage.getItem(LEGACY_STORAGE_KEY));
      return legacyUsername ? [{ username: legacyUsername }] : [];
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isUserEntity) : [];
    } catch {
      return [];
    }
  }

  function writeAll(users: ChessComUserEntity[]): void {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
  }

  function normalize(username: string | null | undefined): string {
    return username?.trim().toLowerCase() ?? "";
  }

  function isUserEntity(value: unknown): value is ChessComUserEntity {
    return typeof (value as ChessComUserEntity | null)?.username === "string";
  }
}

export const chessComUserRepository: ChessComUserRepository =
  new ChessComUserStorage.LocalStorageChessComUserRepository();
