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

  it("returns null when nothing is saved", function testCase() {
    expect(chessComUserRepository.get()).toBeNull();
  });

  it("saves and loads normalized username", function testCase() {
    expect(chessComUserRepository.save({ username: "  Vladimir  " })).toEqual({ username: "vladimir" });

    expect(chessComUserRepository.get()).toEqual({ username: "vladimir" });
  });

  it("removes the stored username when saving an empty one", function testCase() {
    chessComUserRepository.save({ username: "vladimir" });

    expect(chessComUserRepository.save({ username: "   " })).toBeNull();
    expect(chessComUserRepository.get()).toBeNull();
  });

  it("deletes the stored username", function testCase() {
    chessComUserRepository.save({ username: "vladimir" });

    chessComUserRepository.delete();

    expect(chessComUserRepository.get()).toBeNull();
  });
});
