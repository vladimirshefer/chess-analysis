import { describe, expect, it } from "vitest";
import { EngineEvaluationPriorities } from "../ChessEngine.ts";
import { NativeChessEngine, StockfishRuntime } from "./NativeChessEngine.ts";

describe("StockfishRuntime.resolve", function suite() {
  it("selects multi-threaded runtime when browser prerequisites are available", function testCase() {
    const runtime = StockfishRuntime.resolve({
      crossOriginIsolated: true,
      hasSharedArrayBuffer: true,
      hardwareConcurrency: 8,
    });

    expect(runtime).toEqual({
      mode: "lite-mt",
      workerUrl: "/stockfish/stockfish-18-lite.js",
      threads: 8,
    });
  });

  it("falls back to single-threaded runtime when prerequisites are missing", function testCase() {
    const runtime = StockfishRuntime.resolve({
      crossOriginIsolated: false,
      hasSharedArrayBuffer: true,
      hardwareConcurrency: 8,
    });

    expect(runtime).toEqual({
      mode: "lite-single",
      workerUrl: "/stockfish/stockfish-18-lite-single.js",
      threads: 1,
    });
  });
});

describe("NativeChessEngine", function suite() {
  it("sends uci command on startup", function testCase() {
    const worker = new TestDoubles.FakeWorker();
    let receivedWorkerUrl = "";

    new NativeChessEngine(
      {
        mode: "lite-single",
        workerUrl: "/stockfish/stockfish-18-lite-single.js",
        threads: 1,
      },
      function createWorker(workerUrl) {
        receivedWorkerUrl = workerUrl;
        return worker as unknown as Worker;
      },
    );

    expect(receivedWorkerUrl).toBe("/stockfish/stockfish-18-lite-single.js");
    expect(worker.sentCommands).toEqual(["uci"]);
  });

  it("sends Threads, MultiPV and go commands in multi-thread mode", async function testCase() {
    const worker = new TestDoubles.FakeWorker();
    const engine = new NativeChessEngine(
      {
        mode: "lite-mt",
        workerUrl: "/stockfish/stockfish-18-lite.js",
        threads: 4,
      },
      function createWorker() {
        return worker as unknown as Worker;
      },
    );
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

    const evaluationPromise = engine.evaluate(
      fen,
      { minDepth: 12, linesAmount: 2 },
      EngineEvaluationPriorities.IMMEDIATE,
    );
    worker.emit("info depth 12 multipv 1 score cp 34 pv e2e4 e7e5");
    worker.emit("info depth 12 multipv 2 score cp 20 pv d2d4 d7d5");
    worker.emit("bestmove e2e4");

    const result = await evaluationPromise;

    expect(worker.sentCommands).toEqual([
      "uci",
      "setoption name Threads value 4",
      "setoption name MultiPV value 2",
      `position fen ${fen}`,
      "go depth 12",
    ]);
    expect(result.depth).toBe(12);
    expect(result.lines).toHaveLength(2);
  });

  it("does not send Threads command in single-thread fallback mode", async function testCase() {
    const worker = new TestDoubles.FakeWorker();
    const engine = new NativeChessEngine(
      {
        mode: "lite-single",
        workerUrl: "/stockfish/stockfish-18-lite-single.js",
        threads: 1,
      },
      function createWorker() {
        return worker as unknown as Worker;
      },
    );
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

    const evaluationPromise = engine.evaluate(
      fen,
      { minDepth: 10, linesAmount: 1 },
      EngineEvaluationPriorities.IMMEDIATE,
    );
    worker.emit("info depth 10 multipv 1 score cp 18 pv e2e4 e7e5");
    worker.emit("bestmove e2e4");

    const result = await evaluationPromise;

    expect(worker.sentCommands).toEqual([
      "uci",
      "setoption name MultiPV value 1",
      `position fen ${fen}`,
      "go depth 10",
    ]);
    expect(result.depth).toBe(10);
    expect(result.lines).toHaveLength(1);
  });
});

namespace TestDoubles {
  export class FakeWorker {
    readonly sentCommands: string[] = [];
    onmessage: ((event: MessageEvent<string>) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;

    postMessage(command: string): void {
      this.sentCommands.push(command);
    }

    emit(line: string): void {
      if (!this.onmessage) return;
      this.onmessage({ data: line } as MessageEvent<string>);
    }
  }
}
