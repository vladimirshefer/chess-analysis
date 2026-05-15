import {
  type ChessEngine,
  type ChessEngineLine,
  type EngineEvaluationPriority,
  type EvaluationRequest,
  type EvaluationUpdate,
  type FullMoveEvaluation,
} from "../ChessEngine.ts";
import { getAbsoluteTerminalEvaluation, parseAbsoluteEvaluation } from "../evaluation.ts";
import { UniversalChessInterface } from "../UniversalChessInterface.ts";

interface RunningEvaluation {
  fen: string;
  minDepth: number;
  linesAmount: number;
  onUpdate?: (update: EvaluationUpdate) => void;
  resolve(result: FullMoveEvaluation): void;
  reject(error: unknown): void;
  collectedByMultiPv: Map<number, ChessEngineLine>;
}

export namespace StockfishRuntime {
  export type Mode = "lite-mt" | "lite-single";

  export interface Config {
    mode: Mode;
    workerUrl: string;
    threads: number;
  }

  export interface Capabilities {
    crossOriginIsolated: boolean;
    hasSharedArrayBuffer: boolean;
    hardwareConcurrency: number;
  }

  const MT_WORKER_URL = "/stockfish/stockfish-18-lite.js";
  const SINGLE_WORKER_URL = "/stockfish/stockfish-18-lite-single.js";
  const ENGINE_NAME_BASE = "Stockfish 18 Lite";
  const DEFAULT_THREADS = 1;
  const MAX_THREADS = 32;

  export function resolve(capabilities: Capabilities = detectCapabilities()): Config {
    if (!supportsMultiThreading(capabilities)) {
      return {
        mode: "lite-single",
        workerUrl: SINGLE_WORKER_URL,
        threads: DEFAULT_THREADS,
      };
    }

    return {
      mode: "lite-mt",
      workerUrl: MT_WORKER_URL,
      threads: computeThreads(capabilities.hardwareConcurrency),
    };
  }

  export function detectCapabilities(): Capabilities {
    const globalScope = globalThis as unknown as {
      crossOriginIsolated?: boolean;
      SharedArrayBuffer?: typeof SharedArrayBuffer;
      navigator?: Navigator;
    };
    const hardwareConcurrency = Math.trunc(globalScope.navigator?.hardwareConcurrency ?? DEFAULT_THREADS);

    return {
      crossOriginIsolated: globalScope.crossOriginIsolated === true,
      hasSharedArrayBuffer: typeof globalScope.SharedArrayBuffer !== "undefined",
      hardwareConcurrency: hardwareConcurrency > 0 ? hardwareConcurrency : DEFAULT_THREADS,
    };
  }

  export function toEngineName(config: Config): string {
    if (config.mode === "lite-mt") return `${ENGINE_NAME_BASE} MT (${config.threads}T)`;
    return `${ENGINE_NAME_BASE} Single`;
  }

  function supportsMultiThreading(capabilities: Capabilities): boolean {
    return (
      capabilities.crossOriginIsolated && capabilities.hasSharedArrayBuffer && capabilities.hardwareConcurrency >= 2
    );
  }

  function computeThreads(hardwareConcurrency: number): number {
    const normalized = Math.trunc(hardwareConcurrency);
    if (normalized < 2) return 2;
    if (normalized > MAX_THREADS) return MAX_THREADS;
    return normalized;
  }
}

export class NativeChessEngine implements ChessEngine {
  private readonly worker: Worker;
  private readonly runtime: StockfishRuntime.Config;
  private currentEvaluation: RunningEvaluation | null = null;

  constructor(
    runtime: StockfishRuntime.Config = StockfishRuntime.resolve(),
    workerFactory: (workerUrl: string) => Worker = createStockfishWorker,
  ) {
    this.runtime = runtime;
    this.worker = workerFactory(this.runtime.workerUrl);
    this.worker.onmessage = this.handleMessage.bind(this);
    this.worker.onerror = this.handleError.bind(this);
    this.worker.postMessage("uci");
  }

  evaluate(
    fen: string,
    options: EvaluationRequest,
    _priority: EngineEvaluationPriority,
    onUpdate?: (update: EvaluationUpdate) => void,
  ): Promise<FullMoveEvaluation> {
    if (this.currentEvaluation) {
      return Promise.reject(new Error("NativeChessEngine is busy. Wrap it with QueuedChessEngine."));
    }

    const linesAmount = Math.max(1, Math.trunc(options.linesAmount));

    return new Promise<FullMoveEvaluation>((resolve, reject) => {
      this.currentEvaluation = {
        fen,
        minDepth: options.minDepth,
        linesAmount,
        onUpdate,
        resolve,
        reject,
        collectedByMultiPv: new Map<number, ChessEngineLine>(),
      };

      if (this.runtime.mode === "lite-mt") {
        this.worker.postMessage(`setoption name Threads value ${this.runtime.threads}`);
      }
      this.worker.postMessage(`setoption name MultiPV value ${linesAmount}`);
      this.worker.postMessage(`position fen ${fen}`);
      this.worker.postMessage(`go depth ${options.minDepth}`);
    });
  }

  async getEvaluation(_fen: string, _minDepth: number = 0): Promise<FullMoveEvaluation | null> {
    return Promise.resolve(null);
  }

  async getLines(_fen: string, _minDepth: number = 0, _amount: number = 1): Promise<ChessEngineLine[] | null> {
    return Promise.resolve(null);
  }

  private handleMessage(event: MessageEvent<string>): void {
    const activeEvaluation = this.currentEvaluation;
    if (!activeEvaluation) return;

    const parsedLine = UniversalChessInterface.parseEngineLine(event.data);
    if (!parsedLine) return;

    if (parsedLine.type === "info") {
      this.handleInfoLine(activeEvaluation, parsedLine.data);
      return;
    }

    if (parsedLine.type === "bestmove") {
      this.handleBestMove(activeEvaluation);
    }
  }

  private handleInfoLine(activeEvaluation: RunningEvaluation, infoLine: UniversalChessInterface.InfoLineDto): void {
    const line = toChessEngineLine(activeEvaluation.fen, infoLine);
    if (!line) return;

    activeEvaluation.collectedByMultiPv.set(line.multipv, line);
    const update = buildUpdate(activeEvaluation, false);
    if (!update || !activeEvaluation.onUpdate) return;
    notifyUpdateSafely(activeEvaluation.onUpdate, update);
  }

  private handleBestMove(activeEvaluation: RunningEvaluation): void {
    const finalResult = buildFinalEvaluation(activeEvaluation) ?? buildTerminalEvaluation(activeEvaluation.fen);
    if (!finalResult) {
      activeEvaluation.reject(new Error("Engine finished without a valid evaluation"));
      this.currentEvaluation = null;
      return;
    }

    if (activeEvaluation.onUpdate) {
      notifyUpdateSafely(activeEvaluation.onUpdate, { ...finalResult, isFinal: true });
    }
    activeEvaluation.resolve(finalResult);
    this.currentEvaluation = null;
  }

  private handleError(error: ErrorEvent): void {
    if (!this.currentEvaluation) return;

    this.currentEvaluation.reject(error);
    this.currentEvaluation = null;
  }
}

function createStockfishWorker(workerUrl: string): Worker {
  return new Worker(workerUrl);
}

function toChessEngineLine(fen: string, infoLine: UniversalChessInterface.InfoLineDto): ChessEngineLine | null {
  const depth = infoLine.depth ?? 0;
  if (depth <= 0) return null;

  const pv = infoLine.principalVariation;
  if (!pv || pv.length === 0) return null;

  const hasCentipawn = typeof infoLine.scoreCentipawn === "number";
  const hasMate = typeof infoLine.mateInMoves === "number";
  if (!hasCentipawn && !hasMate) return null;

  const cpScore = hasCentipawn ? infoLine.scoreCentipawn : undefined;
  const mateScore = hasMate ? infoLine.mateInMoves : undefined;

  return {
    uci: pv[0],
    pv,
    evaluation: parseAbsoluteEvaluation(fen, cpScore, mateScore),
    depth,
    multipv: infoLine.multiPrincipalVariation ?? 1,
  };
}

function buildUpdate(activeEvaluation: RunningEvaluation, isFinal: boolean): EvaluationUpdate | null {
  const lines = [...activeEvaluation.collectedByMultiPv.values()]
    .sort(function sortByMultiPv(left, right) {
      return left.multipv - right.multipv;
    })
    .slice(0, activeEvaluation.linesAmount);

  if (lines.length === 0) return null;

  return {
    fen: activeEvaluation.fen,
    evaluation: lines[0].evaluation,
    depth: lines[0].depth,
    lines,
    isFinal,
  };
}

function buildFinalEvaluation(activeEvaluation: RunningEvaluation): FullMoveEvaluation | null {
  const lines = [...activeEvaluation.collectedByMultiPv.values()]
    .filter(function matchByDepth(line) {
      return line.depth >= activeEvaluation.minDepth;
    })
    .sort(function sortByMultiPv(left, right) {
      return left.multipv - right.multipv;
    })
    .slice(0, activeEvaluation.linesAmount);

  if (lines.length === 0) return null;

  return {
    fen: activeEvaluation.fen,
    evaluation: lines[0].evaluation,
    depth: Math.min(
      ...lines.map(function getDepth(line) {
        return line.depth;
      }),
    ),
    lines,
  };
}

function buildTerminalEvaluation(fen: string): FullMoveEvaluation | null {
  const evaluation = getAbsoluteTerminalEvaluation(fen);
  if (!evaluation) return null;

  return {
    fen,
    evaluation,
    depth: 0,
    lines: [],
  };
}

function notifyUpdateSafely(callback: (update: EvaluationUpdate) => void, update: EvaluationUpdate): void {
  try {
    callback(update);
  } catch (error) {
    console.error("Failed to deliver engine update to subscriber", error);
  }
}
