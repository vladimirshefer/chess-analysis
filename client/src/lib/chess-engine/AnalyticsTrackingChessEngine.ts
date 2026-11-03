import {
  type ChessEngine,
  type ChessEngineLine,
  type EngineEvaluationPriority,
  type EvaluationRequest,
  type EvaluationUpdate,
  type FullMoveEvaluation,
} from "./ChessEngine.ts";
import { Analytics } from "../Analytics.ts";

/** Sends an analytics event for every position the wrapped engine actually computes. */
export class AnalyticsTrackingChessEngine implements ChessEngine {
  private readonly delegate: ChessEngine;

  constructor(delegate: ChessEngine) {
    this.delegate = delegate;
  }

  async evaluate(
    fen: string,
    options: EvaluationRequest,
    priority: EngineEvaluationPriority,
    onUpdate?: (update: EvaluationUpdate) => void,
  ): Promise<FullMoveEvaluation> {
    const result = await this.delegate.evaluate(fen, options, priority, onUpdate);
    Analytics.trackEvent("move_analyzed");
    return result;
  }

  getEvaluation(fen: string, minDepth?: number): Promise<FullMoveEvaluation | null> {
    return this.delegate.getEvaluation(fen, minDepth);
  }

  getLines(fen: string, minDepth?: number, amount?: number): Promise<ChessEngineLine[] | null> {
    return this.delegate.getLines(fen, minDepth, amount);
  }
}
