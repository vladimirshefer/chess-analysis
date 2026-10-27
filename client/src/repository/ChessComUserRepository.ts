export interface ChessComUserEntity {
  username: string;
}

export interface ChessComUserRepository {
  get(): ChessComUserEntity | null;
  save(entity: ChessComUserEntity): ChessComUserEntity | null;
  delete(): void;
}

export namespace ChessComUserStorage {
  const STORAGE_KEY = "chess-com-username";

  export class LocalStorageChessComUserRepository implements ChessComUserRepository {
    get(): ChessComUserEntity | null {
      const username = globalThis.localStorage.getItem(STORAGE_KEY)?.trim();
      return username ? { username } : null;
    }

    save(entity: ChessComUserEntity): ChessComUserEntity | null {
      const username = entity.username.trim().toLowerCase();
      if (!username) {
        this.delete();
        return null;
      }
      globalThis.localStorage.setItem(STORAGE_KEY, username);
      return { username };
    }

    delete(): void {
      globalThis.localStorage.removeItem(STORAGE_KEY);
    }
  }
}

export const chessComUserRepository: ChessComUserRepository =
  new ChessComUserStorage.LocalStorageChessComUserRepository();
