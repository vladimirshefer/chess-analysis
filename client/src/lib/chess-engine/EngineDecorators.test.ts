import { describe, expect, it, vi } from "vitest";
import { createEvaluationCache } from "../EvaluationCache.ts";
import {
  type ChessEngine,
  type EngineEvaluationPriority,
  EngineEvaluationPriorities,
  type EvaluationRequest,
  type EvaluationUpdate,
  type FullMoveEvaluation,
} from "../ChessEngine.ts";
import { CachedChessEngine } from "./CachedChessEngine.ts";
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

    getEvaluation(_fen: string, _minDepth: number = 0): FullMoveEvaluation | null {
      return null;
    }

    getLines(_fen: string, _minDepth: number = 0, _amount: number = 1) {
      return null;
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

    getEvaluation(_fen: string, _minDepth: number = 0): FullMoveEvaluation | null {
      return null;
    }

    getLines(_fen: string, _minDepth: number = 0, _amount: number = 1) {
      return null;
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

    getEvaluation(_fen: string, _minDepth: number = 0): FullMoveEvaluation | null {
      return null;
    }

    getLines(_fen: string, _minDepth: number = 0, _amount: number = 1) {
      return null;
    }
  }
}
