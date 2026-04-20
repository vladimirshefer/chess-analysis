import { describe, expect, it, vi } from "vitest";
import { createEvaluationCache } from "./EvaluationCache.ts";
import {
  type ChessEngine,
  type ChessEngineLine,
  type EngineEvaluationPriority,
  EngineEvaluationPriorities,
  type EvaluationRequest,
  type EvaluationUpdate,
  type FullMoveEvaluation,
} from "../ChessEngine.ts";
import { PositionEvaluations } from "../PositionEvaluationRepository.ts";
import { GameResult } from "../evaluation.ts";
import { CachedChessEngine } from "./CachedChessEngine.ts";
import { PersistentChessEngine } from "./PersistentChessEngine.ts";
import { QueuedChessEngine } from "./QueuedChessEngine.ts";

describe("CachedChessEngine", function suite() {
  it("returns cached result without calling delegate", async function testCase() {
    const cache = createEvaluationCache();
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const cachedEvaluation = createEvaluation(fen, 12, 2);
    cache.addEvaluation(fen, cachedEvaluation.depth, cachedEvaluation.evaluation, cachedEvaluation.lines);

    const delegate = new TestDoubles.NoopEngine();
    const engine = new CachedChessEngine(delegate, cache);
    const onUpdate = vi.fn();

    const result = await engine.evaluate(
      fen,
      { minDepth: 12, linesAmount: 1 },
      EngineEvaluationPriorities.IMMEDIATE,
      onUpdate,
    );

    expect(delegate.evaluateCallCount).toBe(0);
    expect(result.lines).toHaveLength(1);
    expect(onUpdate).toHaveBeenCalledOnce();
    expect(onUpdate.mock.calls[0][0].isFinal).toBe(true);
  });

  it("passes through to delegate and stores final result in cache", async function testCase() {
    const cache = createEvaluationCache();
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const delegateResult = createEvaluation(fen, 14, 2);
    const delegate = new TestDoubles.FixedResultEngine(delegateResult);
    const engine = new CachedChessEngine(delegate, cache);

    const first = await engine.evaluate(fen, { minDepth: 14, linesAmount: 2 }, EngineEvaluationPriorities.BACKGROUND);
    const second = await engine.evaluate(fen, { minDepth: 14, linesAmount: 2 }, EngineEvaluationPriorities.BACKGROUND);

    expect(first.depth).toBe(14);
    expect(second.depth).toBe(14);
    expect(delegate.evaluateCallCount).toBe(1);
    expect(cache.getEvaluation(fen, 14)).not.toBeNull();
  });
});

describe("PersistentChessEngine", function suite() {
  it("returns persisted result without calling delegate", async function testCase() {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const repository = new TestDoubles.FakeRepository([
      {
        positionFen: fen,
        engineId: "stockfish.js-16.1-lite",
        searchDepth: 14,
        evaluation: 35,
        variationLines: [
          {
            principalVariationMoves: ["e2e4", "e7e5"],
            evaluation: 35,
          },
          {
            principalVariationMoves: ["d2d4", "d7d5"],
            evaluation: 20,
          },
        ],
      },
    ]);
    const delegate = new TestDoubles.NoopEngine();
    const engine = new PersistentChessEngine(delegate, repository);
    const onUpdate = vi.fn();

    const result = await engine.evaluate(
      fen,
      { minDepth: 12, linesAmount: 1 },
      EngineEvaluationPriorities.IMMEDIATE,
      onUpdate,
    );

    expect(delegate.evaluateCallCount).toBe(0);
    expect(result.depth).toBe(14);
    expect(result.lines).toHaveLength(1);
    expect(onUpdate).toHaveBeenCalledOnce();
    expect(onUpdate.mock.calls[0][0].isFinal).toBe(true);
    expect(repository.saveCalls).toHaveLength(0);
  });

  it("delegates on cache miss and stores final result", async function testCase() {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const repository = new TestDoubles.FakeRepository([]);
    const delegate = new TestDoubles.ControlledEngine();
    const engine = new PersistentChessEngine(delegate, repository);
    const onUpdate = vi.fn();

    const evaluationPromise = engine.evaluate(
      fen,
      { minDepth: 12, linesAmount: 2 },
      EngineEvaluationPriorities.BACKGROUND,
      onUpdate,
    );
    await flushMicrotasks();

    delegate.emitUpdate(0, {
      ...createEvaluation(fen, 6, 2),
      isFinal: false,
    });
    expect(repository.saveCalls).toHaveLength(0);

    delegate.resolveCall(0, createEvaluation(fen, 12, 2));
    const result = await evaluationPromise;
    await flushMicrotasks();

    expect(result.depth).toBe(12);
    expect(onUpdate).toHaveBeenCalled();
    expect(repository.saveCalls).toHaveLength(1);
    expect(repository.saveCalls[0].searchDepth).toBe(12);
  });

  it("decodes terminal persisted values into result evaluations", async function testCase() {
    const whiteToMoveFen = "7k/6Q1/6K1/8/8/8/8/8 w - - 0 1";
    const blackToMoveFen = "6k1/6Q1/6K1/8/8/8/8/8 b - - 0 1";
    const repository = new TestDoubles.FakeRepository([
      {
        positionFen: whiteToMoveFen,
        engineId: "stockfish.js-16.1-lite",
        searchDepth: 0,
        evaluation: 2_000_000,
        variationLines: [
          {
            principalVariationMoves: ["g7h8q"],
            evaluation: 2_000_000,
          },
        ],
      },
      {
        positionFen: blackToMoveFen,
        engineId: "stockfish.js-16.1-lite",
        searchDepth: 0,
        evaluation: -2_000_000,
        variationLines: [
          {
            principalVariationMoves: ["g8h8"],
            evaluation: -2_000_000,
          },
        ],
      },
    ]);
    const engine = new PersistentChessEngine(new TestDoubles.NoopEngine(), repository);

    const whiteResult = await engine.getEvaluation(whiteToMoveFen, 0);
    const blackResult = await engine.getEvaluation(blackToMoveFen, 0);

    expect(whiteResult?.evaluation).toEqual({
      kind: "result",
      result: GameResult.WHITE_WIN,
    });
    expect(blackResult?.evaluation).toEqual({
      kind: "result",
      result: GameResult.WHITE_WIN,
    });
  });
});

describe("QueuedChessEngine", function suite() {
  it("executes pending jobs by priority order", async function testCase() {
    const delegate = new TestDoubles.ControlledEngine();
    const engine = new QueuedChessEngine(delegate);

    const firstPromise = engine.evaluate(
      "fen-a",
      { minDepth: 12, linesAmount: 1 },
      EngineEvaluationPriorities.BACKGROUND,
    );
    const secondPromise = engine.evaluate(
      "fen-b",
      { minDepth: 12, linesAmount: 1 },
      EngineEvaluationPriorities.IMMEDIATE,
    );
    const thirdPromise = engine.evaluate("fen-c", { minDepth: 12, linesAmount: 1 }, EngineEvaluationPriorities.NEXT);

    expect(delegate.calls).toHaveLength(1);
    expect(delegate.calls[0].fen).toBe("fen-a");

    delegate.resolveCall(0, createEvaluation("fen-a", 12, 1));
    await flushMicrotasks();

    expect(delegate.calls).toHaveLength(2);
    expect(delegate.calls[1].fen).toBe("fen-b");

    delegate.resolveCall(1, createEvaluation("fen-b", 12, 1));
    await flushMicrotasks();

    expect(delegate.calls).toHaveLength(3);
    expect(delegate.calls[2].fen).toBe("fen-c");

    delegate.resolveCall(2, createEvaluation("fen-c", 12, 1));

    await Promise.all([firstPromise, secondPromise, thirdPromise]);
  });

  it("reuses compatible same-fen job and isolates onUpdate errors", async function testCase() {
    const delegate = new TestDoubles.ControlledEngine();
    const engine = new QueuedChessEngine(delegate);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(function noop() {});
    const failingOnUpdate = vi.fn(function throwOnUpdate() {
      throw new Error("onUpdate failed");
    });
    const safeOnUpdate = vi.fn();

    const firstPromise = engine.evaluate(
      "fen-shared",
      { minDepth: 12, linesAmount: 2 },
      EngineEvaluationPriorities.BACKGROUND,
      failingOnUpdate,
    );
    const secondPromise = engine.evaluate(
      "fen-shared",
      { minDepth: 10, linesAmount: 1 },
      EngineEvaluationPriorities.IMMEDIATE,
      safeOnUpdate,
    );

    expect(delegate.calls).toHaveLength(1);

    delegate.emitUpdate(0, {
      ...createEvaluation("fen-shared", 10, 2),
      isFinal: false,
    });

    expect(failingOnUpdate).toHaveBeenCalled();
    expect(safeOnUpdate).toHaveBeenCalled();

    delegate.resolveCall(0, createEvaluation("fen-shared", 12, 2));
    await Promise.all([firstPromise, secondPromise]);

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

function createEvaluation(fen: string, depth: number, linesAmount: number): FullMoveEvaluation {
  return {
    fen,
    depth,
    evaluation: { kind: "cp", pawns: 0.4 },
    lines: Array.from({ length: linesAmount }, function buildLine(_, index) {
      const lineRank = index + 1;
      return {
        uci: "e2e4",
        pv: ["e2e4", "e7e5"],
        evaluation: { kind: "cp", pawns: 0.4 - index * 0.1 },
        depth,
        multipv: lineRank,
      };
    }),
  };
}

function flushMicrotasks(): Promise<void> {
  return new Promise(function resolveSoon(resolve) {
    setTimeout(resolve, 0);
  });
}

namespace TestDoubles {
  export class NoopEngine implements ChessEngine {
    evaluateCallCount = 0;

    evaluate(
      _fen: string,
      _options: EvaluationRequest,
      _priority: EngineEvaluationPriority,
      _onUpdate?: (update: EvaluationUpdate) => void,
    ): Promise<FullMoveEvaluation> {
      this.evaluateCallCount += 1;
      return Promise.reject(new Error("NoopEngine.evaluate should not be called"));
    }

    getEvaluation(_fen: string, _minDepth: number = 0): Promise<FullMoveEvaluation | null> {
      return Promise.resolve(null);
    }

    getLines(_fen: string, _minDepth: number = 0, _amount: number = 1): Promise<ChessEngineLine[] | null> {
      return Promise.resolve(null);
    }
  }

  export class FixedResultEngine implements ChessEngine {
    evaluateCallCount = 0;
    private readonly result: FullMoveEvaluation;

    constructor(result: FullMoveEvaluation) {
      this.result = result;
    }

    evaluate(
      _fen: string,
      _options: EvaluationRequest,
      _priority: EngineEvaluationPriority,
      _onUpdate?: (update: EvaluationUpdate) => void,
    ): Promise<FullMoveEvaluation> {
      this.evaluateCallCount += 1;
      return Promise.resolve(this.result);
    }

    getEvaluation(_fen: string, _minDepth: number = 0): Promise<FullMoveEvaluation | null> {
      return Promise.resolve(null);
    }

    getLines(_fen: string, _minDepth: number = 0, _amount: number = 1): Promise<ChessEngineLine[] | null> {
      return Promise.resolve(null);
    }
  }

  interface ControlledCall {
    fen: string;
    options: EvaluationRequest;
    priority: EngineEvaluationPriority;
    onUpdate?: (update: EvaluationUpdate) => void;
    resolve(result: FullMoveEvaluation): void;
    reject(error: unknown): void;
  }

  export class ControlledEngine implements ChessEngine {
    readonly calls: ControlledCall[] = [];

    evaluate(
      fen: string,
      options: EvaluationRequest,
      priority: EngineEvaluationPriority,
      onUpdate?: (update: EvaluationUpdate) => void,
    ): Promise<FullMoveEvaluation> {
      return new Promise<FullMoveEvaluation>((resolve, reject) => {
        this.calls.push({
          fen,
          options,
          priority,
          onUpdate,
          resolve,
          reject,
        });
      });
    }

    emitUpdate(callIndex: number, update: EvaluationUpdate): void {
      this.calls[callIndex]?.onUpdate?.(update);
    }

    resolveCall(callIndex: number, result: FullMoveEvaluation): void {
      this.calls[callIndex]?.resolve(result);
    }

    getEvaluation(_fen: string, _minDepth: number = 0): Promise<FullMoveEvaluation | null> {
      return Promise.resolve(null);
    }

    getLines(_fen: string, _minDepth: number = 0, _amount: number = 1): Promise<ChessEngineLine[] | null> {
      return Promise.resolve(null);
    }
  }

  export class FakeRepository implements PositionEvaluations.Repository {
    private records: PositionEvaluations.PositionEvaluationRecord[];
    readonly saveCalls: PositionEvaluations.PositionEvaluationRecord[] = [];

    constructor(records: PositionEvaluations.PositionEvaluationRecord[]) {
      this.records = [...records];
    }

    async getAllByPosition(positionFen: string): Promise<PositionEvaluations.PositionEvaluationRecord[]> {
      return Promise.resolve(
        this.records
          .filter(function byFen(record) {
            return record.positionFen === positionFen;
          })
          .map(cloneRecord),
      );
    }

    async getBestForRequest(
      positionFen: string,
      minimumDepth: number,
      minimumLineCount: number,
    ): Promise<PositionEvaluations.PositionEvaluationRecord | null> {
      const candidates = this.records.filter(function byConstraints(record) {
        return (
          record.positionFen === positionFen &&
          record.searchDepth >= minimumDepth &&
          record.variationLines.length >= minimumLineCount
        );
      });

      if (candidates.length === 0) return Promise.resolve(null);

      candidates.sort(function byBest(left, right) {
        if (left.evaluation !== right.evaluation) return right.evaluation - left.evaluation;
        return right.searchDepth - left.searchDepth;
      });
      return Promise.resolve(cloneRecord(candidates[0]));
    }

    async saveEvaluation(record: PositionEvaluations.PositionEvaluationRecord): Promise<void> {
      const cloned = cloneRecord(record);
      this.saveCalls.push(cloned);
      this.records.push(cloned);
    }

    async deleteAllForPosition(positionFen: string): Promise<void> {
      this.records = this.records.filter(function keep(record) {
        return record.positionFen !== positionFen;
      });
    }
  }
}

function cloneRecord(
  record: PositionEvaluations.PositionEvaluationRecord,
): PositionEvaluations.PositionEvaluationRecord {
  return {
    positionFen: record.positionFen,
    engineId: record.engineId,
    searchDepth: record.searchDepth,
    evaluation: record.evaluation,
    variationLines: record.variationLines.map(function cloneLine(line) {
      return {
        principalVariationMoves: [...line.principalVariationMoves],
        evaluation: line.evaluation,
      };
    }),
  };
}
