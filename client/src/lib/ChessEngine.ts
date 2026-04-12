import {
  type EngineEvaluation,
  getTerminalEvaluation,
  parseEngineEvaluation,
} from "./evaluation";
import { UniversalChessInterface } from "./UniversalChessInterface.ts";
import {
  type EvaluationCache,
  sharedEvaluationCache,
} from "./EvaluationCache.ts";

export interface ChessEngineLine {
  /** UCI = Universal Chess Interface */
  uci: string;
  pv: string[];
  evaluation: EngineEvaluation;
  depth: number;
  multipv: number;
}

export interface FullMoveEvaluation {
  /** Chess position in FEN notation */
  fen: string;
  evaluation: EngineEvaluation;
  /** Depth of the evaluation in half-moves */
  depth: number;
  lines: ChessEngineLine[];
}

export interface EvaluationRequest {
  minDepth: number;
  linesAmount: number;
}

export interface EvaluationUpdate extends FullMoveEvaluation {
  isFinal: boolean;
}

export const EngineEvaluationPriority = {
  IMMEDIATE: "IMMEDIATE",
  NEXT: "NEXT",
  BACKGROUND: "BACKGROUND",
} as const;

export type EngineEvaluationPriority =
  (typeof EngineEvaluationPriority)[keyof typeof EngineEvaluationPriority];

export interface ChessEngine {
  evaluate(
    fen: string,
    options: EvaluationRequest,
    priority: EngineEvaluationPriority,
    onUpdate?: (update: EvaluationUpdate) => void,
  ): Promise<FullMoveEvaluation>;

  getEvaluation(fen: string, minDepth?: number): FullMoveEvaluation | null;

  getLines(
    fen: string,
    minDepth?: number,
    amount?: number,
  ): ChessEngineLine[] | null;
}

type JobPriority = "IMMEDIATE" | "NEXT" | "BACKGROUND";

interface JobSubscriber {
  onUpdate?: (update: EvaluationUpdate) => void;
  resolve(result: FullMoveEvaluation): void;
  reject(error: unknown): void;
}

interface EngineJob {
  fen: string;
  minDepth: number;
  linesAmount: number;
  priority: JobPriority;
  subscribers: JobSubscriber[];
  collected: Map<number, ChessEngineLine>;
  lastUpdate: EvaluationUpdate | null;
  shouldRestart: boolean;
}

class StockfishQueue {
  private worker: Worker;
  private cache: EvaluationCache;
  private currentJob: EngineJob | null = null;
  private pendingJobs: EngineJob[] = [];

  constructor(cache: EvaluationCache) {
    this.cache = cache;
    this.worker = new Worker("/stockfish/stockfish.js");
    this.worker.onmessage = this.handleMessage.bind(this);
    this.worker.onerror = this.handleError.bind(this);
    this.worker.postMessage("uci");
  }

  evaluate(
    fen: string,
    options: EvaluationRequest,
    priority: EngineEvaluationPriority,
    onUpdate?: (update: EvaluationUpdate) => void,
  ): Promise<FullMoveEvaluation> {
    return this.requestEvaluation(priority, fen, options, onUpdate);
  }

  private requestEvaluation(
    priority: JobPriority,
    fen: string,
    options: EvaluationRequest,
    onUpdate?: (update: EvaluationUpdate) => void,
  ): Promise<FullMoveEvaluation> {
    const terminalEvaluation = getTerminalEvaluation(fen);
    if (terminalEvaluation) {
      const terminalResult: FullMoveEvaluation = {
        fen,
        evaluation: terminalEvaluation,
        depth: 0,
        lines: [],
      };
      if (onUpdate) onUpdate({ ...terminalResult, isFinal: true });
      return Promise.resolve(terminalResult);
    }

    const cached = this.cache.getEvaluation(fen, options.minDepth);
    if (cached && cached.lines.length >= options.linesAmount) {
      const cachedResult = trimEvaluationLines(cached, options.linesAmount);
      if (onUpdate) onUpdate({ ...cachedResult, isFinal: true });
      return Promise.resolve(cachedResult);
    }

    return new Promise<FullMoveEvaluation>((resolve, reject) => {
      const subscriber: JobSubscriber = { onUpdate, resolve, reject };
      const existingJob = this.findJob(fen);

      if (existingJob && canReuseExistingJob(existingJob, options)) {
        existingJob.subscribers.push(subscriber);
        upgradeJobPriority(existingJob, priority);
        if (existingJob.lastUpdate && onUpdate)
          onUpdate(
            trimUpdateLines(existingJob.lastUpdate, options.linesAmount),
          );

        if (
          existingJob === this.currentJob &&
          shouldPreemptCurrent(existingJob, priority, options)
        ) {
          existingJob.shouldRestart = true;
          this.worker.postMessage("stop");
        } else if (existingJob !== this.currentJob) {
          this.reorderPendingJobs();
          this.processQueue();
        }
        return;
      }

      this.pendingJobs.push({
        fen,
        minDepth: options.minDepth,
        linesAmount: options.linesAmount,
        priority,
        subscribers: [subscriber],
        collected: new Map<number, ChessEngineLine>(),
        lastUpdate: null,
        shouldRestart: false,
      });
      this.reorderPendingJobs();
      this.processQueue();
    });
  }

  private findJob(fen: string): EngineJob | null {
    if (this.currentJob?.fen === fen) return this.currentJob;

    return (
      this.pendingJobs.find(function matchJob(job) {
        return job.fen === fen;
      }) ?? null
    );
  }

  private reorderPendingJobs(): void {
    this.pendingJobs.sort(function sortJobs(left, right) {
      return getPriorityRank(left.priority) - getPriorityRank(right.priority);
    });
  }

  private processQueue(): void {
    if (this.currentJob || this.pendingJobs.length === 0) return;

    const nextJob = this.pendingJobs.shift();
    if (!nextJob) return;

    nextJob.collected = new Map<number, ChessEngineLine>();
    nextJob.lastUpdate = null;
    nextJob.shouldRestart = false;
    this.currentJob = nextJob;

    this.worker.postMessage(
      `setoption name MultiPV value ${nextJob.linesAmount}`,
    );
    this.worker.postMessage(`position fen ${nextJob.fen}`);
    this.worker.postMessage(`go depth ${nextJob.minDepth}`);
  }

  private handleMessage(event: MessageEvent<string>): void {
    const currentJob = this.currentJob;
    if (!currentJob) return;

    const message = event.data;
    const parsedLine = UniversalChessInterface.parseEngineLine(message);
    if (!parsedLine) return;

    if (parsedLine.type === "info") {
      this.handleInfoMessage(currentJob, parsedLine.data);
      return;
    }

    if (parsedLine.type === "bestmove") {
      this.handleBestMove(currentJob);
    }
  }

  private handleInfoMessage(
    job: EngineJob,
    infoLine: UniversalChessInterface.InfoLineDto,
  ): void {
    const engineLine = ChessEngineUciAdapter.toChessEngineLine(
      job.fen,
      infoLine,
    );
    if (!engineLine) return;

    job.collected.set(engineLine.multipv, engineLine);

    const update = buildUpdate(job, false);
    if (!update) return;

    job.lastUpdate = update;
    notifySubscribers(job, update);
  }

  private handleBestMove(job: EngineJob): void {
    if (job.shouldRestart) {
      job.shouldRestart = false;
      this.currentJob = null;
      this.pendingJobs.unshift(job);
      this.reorderPendingJobs();
      this.processQueue();
      return;
    }

    const finalResult =
      buildFinalEvaluation(job) ?? buildTerminalEvaluation(job);
    if (finalResult) {
      this.cache.addEvaluation(
        job.fen,
        finalResult.depth,
        finalResult.evaluation,
        finalResult.lines,
      );
      notifySubscribers(job, { ...finalResult, isFinal: true });
      resolveSubscribers(job, finalResult);
    } else {
      rejectSubscribers(
        job,
        new Error("Engine finished without a valid evaluation"),
      );
    }

    this.currentJob = null;
    this.processQueue();
  }

  private handleError(error: ErrorEvent): void {
    if (this.currentJob) {
      rejectSubscribers(this.currentJob, error);
      this.currentJob = null;
    }

    while (this.pendingJobs.length > 0) {
      const job = this.pendingJobs.shift();
      if (job) rejectSubscribers(job, error);
    }
  }
}

namespace ChessEngineUciAdapter {
  export function toChessEngineLine(
    fen: string,
    infoLine: UniversalChessInterface.InfoLineDto,
  ): ChessEngineLine | null {
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
}

class StockfishChessEngine implements ChessEngine {
  private queue: StockfishQueue;
  private cache: EvaluationCache;

  constructor() {
    this.cache = sharedEvaluationCache;
    this.queue = new StockfishQueue(this.cache);
  }

  evaluate(
    fen: string,
    options: EvaluationRequest,
    priority: EngineEvaluationPriority,
    onUpdate?: (update: EvaluationUpdate) => void,
  ): Promise<FullMoveEvaluation> {
    return this.queue.evaluate(fen, options, priority, onUpdate);
  }

  getEvaluation(fen: string, minDepth: number = 0): FullMoveEvaluation | null {
    return this.cache.getEvaluation(fen, minDepth);
  }

  getLines(
    fen: string,
    minDepth: number = 0,
    amount: number = 1,
  ): ChessEngineLine[] | null {
    const evaluation = this.cache.getEvaluation(fen, minDepth);
    if (!evaluation || evaluation.lines.length < amount) return null;
    return evaluation.lines.slice(0, amount);
  }
}

function buildUpdate(
  job: EngineJob,
  isFinal: boolean,
): EvaluationUpdate | null {
  const lines = [...job.collected.values()]
    .sort(function sortByMultiPv(left, right) {
      return left.multipv - right.multipv;
    })
    .slice(0, job.linesAmount);

  if (lines.length === 0) return null;

  return {
    fen: job.fen,
    evaluation: lines[0].evaluation,
    depth: lines[0].depth,
    lines,
    isFinal,
  };
}

function buildFinalEvaluation(job: EngineJob): FullMoveEvaluation | null {
  const lines = [...job.collected.values()]
    .filter(function matchDepth(line) {
      return line.depth >= job.minDepth;
    })
    .sort(function sortByMultiPv(left, right) {
      return left.multipv - right.multipv;
    })
    .slice(0, job.linesAmount);

  if (lines.length === 0) return null;

  return {
    fen: job.fen,
    evaluation: lines[0].evaluation,
    depth: Math.min(
      ...lines.map(function getDepth(line) {
        return line.depth;
      }),
    ),
    lines,
  };
}

function buildTerminalEvaluation(job: EngineJob): FullMoveEvaluation | null {
  const evaluation = getTerminalEvaluation(job.fen);
  if (!evaluation) return null;

  return {
    fen: job.fen,
    evaluation,
    depth: 0,
    lines: [],
  };
}

function notifySubscribers(job: EngineJob, update: EvaluationUpdate): void {
  const trimmedUpdate = trimUpdateLines(update, job.linesAmount);
  job.subscribers.forEach(function notify(subscriber) {
    subscriber.onUpdate?.(trimmedUpdate);
  });
}

function resolveSubscribers(job: EngineJob, result: FullMoveEvaluation): void {
  const trimmedResult = trimEvaluationLines(result, job.linesAmount);
  job.subscribers.forEach(function resolve(subscriber) {
    subscriber.resolve(trimmedResult);
  });
}

function rejectSubscribers(job: EngineJob, error: unknown): void {
  job.subscribers.forEach(function reject(subscriber) {
    subscriber.reject(error);
  });
}

function shouldPreemptCurrent(
  job: EngineJob,
  priority: JobPriority,
  options: EvaluationRequest,
): boolean {
  return (
    priority === EngineEvaluationPriority.IMMEDIATE &&
    (getPriorityRank(priority) < getPriorityRank(job.priority) ||
      options.minDepth > job.minDepth ||
      options.linesAmount > job.linesAmount)
  );
}

function trimUpdateLines(
  update: EvaluationUpdate,
  amount: number,
): EvaluationUpdate {
  return {
    ...update,
    lines: update.lines.slice(0, amount),
  };
}

function trimEvaluationLines(
  evaluation: FullMoveEvaluation,
  amount: number,
): FullMoveEvaluation {
  return {
    ...evaluation,
    lines: evaluation.lines.slice(0, amount),
  };
}

function upgradeJobPriority(job: EngineJob, priority: JobPriority): void {
  if (getPriorityRank(priority) < getPriorityRank(job.priority)) {
    job.priority = priority;
  }
}

function canReuseExistingJob(
  job: EngineJob,
  options: EvaluationRequest,
): boolean {
  return (
    job.minDepth >= options.minDepth && job.linesAmount >= options.linesAmount
  );
}

function getPriorityRank(priority: JobPriority): number {
  switch (priority) {
    case EngineEvaluationPriority.IMMEDIATE:
      return 0;
    case EngineEvaluationPriority.NEXT:
      return 1;
    default:
      return 2;
  }
}

let singleton: ChessEngine | null = null;

export function getChessEngine(): ChessEngine {
  if (!singleton) singleton = new StockfishChessEngine();
  return singleton;
}
