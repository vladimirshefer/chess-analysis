import { beforeEach, describe, expect, it } from "vitest";
import {
  type ChessComGameAnalysisEntity,
  ChessComGameAnalysisStorage,
  chessComGameAnalysisRepository,
} from "./ChessComGameAnalysisRepository.ts";

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

function createEntity(gameId: string): ChessComGameAnalysisEntity {
  return {
    gameId,
    status: "done",
    targetDepth: 12,
    analyzedPositions: 1,
    totalPositions: 1,
    lastAnalyzedFen: null,
    whiteAccuracy: 90,
    blackAccuracy: 80,
    histogramValues: [1],
    materialValues: [0],
    analysisByFen: {
      "fen-1": {
        fen: "fen-1",
        evaluation: 25,
        settledMaterialBalance: null,
        depth: 12,
        lines: [],
        isFinal: true,
        source: "engine",
      },
    },
    updatedAt: 1,
  };
}

describe("ChessComGameAnalysisRepository", function suite() {
  beforeEach(function setup() {
    LocalStorageTestMock.install();
  });

  it("stores each game under its own key", function testCase() {
    chessComGameAnalysisRepository.save(createEntity("https://chess.com/game/1"));
    chessComGameAnalysisRepository.save(createEntity("https://chess.com/game/2"));

    expect(globalThis.localStorage.length).toBe(2);
    expect(chessComGameAnalysisRepository.get("https://chess.com/game/1")).toEqual(
      createEntity("https://chess.com/game/1"),
    );
    expect(chessComGameAnalysisRepository.get("missing")).toBeNull();
    expect(chessComGameAnalysisRepository.getAll().map((entity) => entity.gameId)).toEqual([
      "https://chess.com/game/1",
      "https://chess.com/game/2",
    ]);
  });

  it("deletes one game and then all games", async function testCase() {
    chessComGameAnalysisRepository.save(createEntity("a"));
    chessComGameAnalysisRepository.save(createEntity("b"));

    chessComGameAnalysisRepository.delete("a");
    expect(chessComGameAnalysisRepository.getAll().map((entity) => entity.gameId)).toEqual(["b"]);

    await chessComGameAnalysisRepository.deleteAll();
    expect(chessComGameAnalysisRepository.getAll()).toEqual([]);
    expect(globalThis.localStorage.length).toBe(0);
  });

  it("drops data stored under outdated keys", function testCase() {
    globalThis.localStorage.setItem("chess-com-game-analysis-v1", JSON.stringify({ a: createEntity("a") }));
    globalThis.localStorage.setItem("chess-com-game-analysis-v1:a", JSON.stringify(createEntity("a")));
    globalThis.localStorage.setItem("other-key", "keep");

    const repository = new ChessComGameAnalysisStorage.LocalStorageChessComGameAnalysisRepository();

    expect(repository.getAll()).toEqual([]);
    expect(globalThis.localStorage.length).toBe(1);
    expect(globalThis.localStorage.getItem("other-key")).toBe("keep");
  });
});
