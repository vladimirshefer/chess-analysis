import { beforeEach, describe, expect, it } from "vitest";
import { chessComUserRepository } from "./ChessComUserRepository.ts";

namespace LocalStorageTestMock {
  const entriesByKey = new Map<string, string>();

  export function install(): void {
    entriesByKey.clear();

    const storage: Storage = {
      getItem: function getItem(key: string): string | null {
        return entriesByKey.get(key) ?? null;
      },
      setItem: function setItem(key: string, value: string): void {
        entriesByKey.set(key, String(value));
      },
      removeItem: function removeItem(key: string): void {
        entriesByKey.delete(key);
      },
      clear: function clear(): void {
        entriesByKey.clear();
      },
      key: function key(index: number): string | null {
        return [...entriesByKey.keys()][index] ?? null;
      },
      get length(): number {
        return entriesByKey.size;
      },
    };

    Object.defineProperty(globalThis, "localStorage", {
      value: storage,
      configurable: true,
      writable: true,
    });
  }
}

describe("ChessComUserRepository", function suite() {
  beforeEach(function setup() {
    LocalStorageTestMock.install();
  });

  it("returns nothing when no user is saved", function testCase() {
    expect(chessComUserRepository.getAll()).toEqual([]);
    expect(chessComUserRepository.get("vladimir")).toBeNull();
  });

  it("saves and loads normalized username", function testCase() {
    expect(chessComUserRepository.save({ username: "  Vladimir  " })).toEqual({ username: "vladimir" });

    expect(chessComUserRepository.get("VLADIMIR")).toEqual({ username: "vladimir" });
  });

  it("ignores an empty username", function testCase() {
    expect(chessComUserRepository.save({ username: "   " })).toBeNull();
    expect(chessComUserRepository.getAll()).toEqual([]);
  });

  it("keeps the most recently saved user first without duplicates", function testCase() {
    chessComUserRepository.save({ username: "first" });
    chessComUserRepository.save({ username: "second" });
    chessComUserRepository.save({ username: "First" });

    expect(chessComUserRepository.getAll()).toEqual([{ username: "first" }, { username: "second" }]);
  });

  it("deletes a user", function testCase() {
    chessComUserRepository.save({ username: "first" });
    chessComUserRepository.save({ username: "second" });

    chessComUserRepository.delete("second");

    expect(chessComUserRepository.getAll()).toEqual([{ username: "first" }]);
  });

  it("get() without arguments returns the current user and delete() without arguments removes all", function testCase() {
    expect(chessComUserRepository.get()).toBeNull();
    chessComUserRepository.save({ username: "first" });
    chessComUserRepository.save({ username: "second" });

    expect(chessComUserRepository.get()).toEqual({ username: "second" });

    chessComUserRepository.delete();

    expect(chessComUserRepository.get()).toBeNull();
    expect(chessComUserRepository.getAll()).toEqual([]);
  });

  it("migrates the legacy single username", function testCase() {
    globalThis.localStorage.setItem("chess-com-username", "vladimir");

    expect(chessComUserRepository.getAll()).toEqual([{ username: "vladimir" }]);
  });
});
