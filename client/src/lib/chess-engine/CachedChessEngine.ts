import { type EvaluationCache, sharedEvaluationCache } from "./EvaluationCache.ts";
import {
  type ChessEngine,
  type ChessEngineLine,
  type EngineEvaluationPriority,
  type EvaluationRequest,
  type EvaluationUpdate,
  type FullMoveEvaluation,
} from "../ChessEngine.ts";
import { getAbsoluteTerminalEvaluation } from "../evaluation.ts";

export class CachedChessEngine implements ChessEngine {
  private readonly delegate: ChessEngine;
  private readonly cache: EvaluationCache;

  constructor(delegate: ChessEngine, cache: EvaluationCache = sharedEvaluationCache) {
    this.delegate = delegate;
    this.cache = cache;
  }

  async evaluate(
    fen: string,
    options: EvaluationRequest,
    priority: EngineEvaluationPriority,
    onUpdate?: (update: EvaluationUpdate) => void,
  ): Promise<FullMoveEvaluation> {
    const terminalEvaluation = getAbsoluteTerminalEvaluation(fen);
    if (terminalEvaluation) {
      const terminalResult: EvaluationUpdate = {
        fen,
        evaluation: terminalEvaluation,
        depth: options.minDepth,
        lines: [],
        isFinal: true,
      };
      if (onUpdate) notifyUpdateSafely(onUpdate, { ...terminalResult, isFinal: true });
      return Promise.resolve(terminalResult);
    }

    const cached = this.cache.getEvaluation(fen, options.minDepth);
    if (cached && cached.lines.length >= options.linesAmount) {
      if (onUpdate) notifyUpdateSafely(onUpdate, { ...cached, isFinal: true });
      return Promise.resolve(cached);
    }

    const cachedWeak = this.cache.getEvaluation(fen, 0);
    if (cachedWeak) {
      if (onUpdate) notifyUpdateSafely(onUpdate, { ...cachedWeak, isFinal: false });
    }

    const result = await this.delegate.evaluate(fen, options, priority, onUpdate);
    this.cache.addEvaluation(fen, result.depth, result.evaluation, result.lines);
    return result;
  }

  async getEvaluation(fen: string, minDepth: number = 0): Promise<FullMoveEvaluation | null> {
    return Promise.resolve(this.cache.getEvaluation(fen, minDepth));
  }

  async getLines(fen: string, minDepth: number = 0, amount: number = 1): Promise<ChessEngineLine[] | null> {
    const evaluation = this.cache.getEvaluation(fen, minDepth);
    if (!evaluation || evaluation.lines.length < amount) return null;
    return Promise.resolve(evaluation.lines.slice(0, amount));
  }
}

function notifyUpdateSafely(callback: (update: EvaluationUpdate) => void, update: EvaluationUpdate): void {
  try {
    callback(update);
  } catch (error) {
    console.error("Failed to deliver engine update to subscriber", error);
  }
}
