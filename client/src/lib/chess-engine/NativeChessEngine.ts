import {
  type ChessEngine,
  type ChessEngineLine,
  type EngineEvaluationPriority,
  type EvaluationRequest,
  type EvaluationUpdate,
  type FullMoveEvaluation,
} from "../ChessEngine.ts";
import { parseEngineEvaluation, getTerminalEvaluation } from "../evaluation.ts";
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

export class NativeChessEngine implements ChessEngine {
  private readonly worker: Worker;
  private currentEvaluation: RunningEvaluation | null = null;

  constructor(workerFactory: () => Worker = createStockfishWorker) {
    this.worker = workerFactory();
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

    return new Promise<FullMoveEvaluation>((resolve, reject) => {
      this.currentEvaluation = {
        fen,
        minDepth: options.minDepth,
        linesAmount: options.linesAmount,
        onUpdate,
        resolve,
        reject,
        collectedByMultiPv: new Map<number, ChessEngineLine>(),
      };

      this.worker.postMessage(`setoption name MultiPV value ${options.linesAmount}`);
      this.worker.postMessage(`position fen ${fen}`);
      this.worker.postMessage(`go depth ${options.minDepth}`);
    });
  }

  getEvaluation(_fen: string, _minDepth: number = 0): FullMoveEvaluation | null {
    return null;
  }

  getLines(_fen: string, _minDepth: number = 0, _amount: number = 1): ChessEngineLine[] | null {
    return null;
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

function createStockfishWorker(): Worker {
  return new Worker("/stockfish/stockfish.js");
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
    evaluation: parseEngineEvaluation(fen, cpScore, mateScore),
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
  const evaluation = getTerminalEvaluation(fen);
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
