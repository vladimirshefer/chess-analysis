import {
  type ChessEngine,
  type ChessEngineLine,
  type EngineEvaluationPriority,
  type EvaluationRequest,
  type EvaluationUpdate,
  type FullMoveEvaluation,
} from "../ChessEngine.ts";
import { PositionEvaluations } from "../PositionEvaluationRepository.ts";
import {
  absoluteNumericEvaluationToEngineEvaluation,
  engineEvaluationToAbsoluteNumericEvaluation,
} from "../evaluation.ts";

const DEFAULT_ENGINE_ID = "stockfish.js-16.1-lite";

export class PersistentChessEngine implements ChessEngine {
  private readonly delegate: ChessEngine;
  private readonly repository: PositionEvaluations.Repository;
  private readonly engineId: string;

  constructor(
    delegate: ChessEngine,
    repository: PositionEvaluations.Repository = PositionEvaluations.sharedRepository,
    engineId: string = DEFAULT_ENGINE_ID,
  ) {
    this.delegate = delegate;
    this.repository = repository;
    this.engineId = engineId;
  }

  async evaluate(
    fen: string,
    options: EvaluationRequest,
    priority: EngineEvaluationPriority,
    onUpdate?: (update: EvaluationUpdate) => void,
  ): Promise<FullMoveEvaluation> {
    const persisted = await this.repository.getBestForRequest(fen, options.minDepth, options.linesAmount);
    if (persisted) {
      console.log(`Position: ${fen}, eval: ${persisted.evaluation}`);
      const result = trimEvaluationLines(toFullMoveEvaluation(fen, persisted), options.linesAmount);
      if (onUpdate) notifyUpdateSafely(onUpdate, { ...result, isFinal: true });
      return result;
    }

    const result = await this.delegate.evaluate(fen, options, priority, onUpdate);
    void this.persistFinalEvaluation(result);
    return result;
  }

  async getEvaluation(fen: string, minDepth: number = 0): Promise<FullMoveEvaluation | null> {
    const persisted = await this.repository.getBestForRequest(fen, minDepth, 1);
    if (persisted) {
      console.log(`Position: ${fen}, eval: ${persisted.evaluation}`);
      return toFullMoveEvaluation(fen, persisted);
    }
    return this.delegate.getEvaluation(fen, minDepth);
  }

  async getLines(fen: string, minDepth: number = 0, amount: number = 1): Promise<ChessEngineLine[] | null> {
    const persisted = await this.repository.getBestForRequest(fen, minDepth, amount);
    if (persisted) {
      console.log(`Position: ${fen}, eval: ${persisted.evaluation}`);
      const lines = toFullMoveEvaluation(fen, persisted).lines;
      return lines.length >= amount ? lines.slice(0, amount) : null;
    }

    return this.delegate.getLines(fen, minDepth, amount);
  }

  private async persistFinalEvaluation(result: FullMoveEvaluation): Promise<void> {
    const record: PositionEvaluations.PositionEvaluationRecord = {
      positionFen: result.fen,
      engineId: this.engineId,
      searchDepth: result.depth,
      evaluation: engineEvaluationToAbsoluteNumericEvaluation(result.fen, result.evaluation),
      variationLines: result.lines.map(function toVariationLine(line) {
        return {
          principalVariationMoves: [...line.pv],
          evaluation: engineEvaluationToAbsoluteNumericEvaluation(result.fen, line.evaluation),
        };
      }),
    };

    try {
      await this.repository.saveEvaluation(record);
    } catch (error) {
      console.error("Failed to save persistent engine evaluation", error);
    }
  }
}

function toFullMoveEvaluation(fen: string, record: PositionEvaluations.PositionEvaluationRecord): FullMoveEvaluation {
  const lines: ChessEngineLine[] = record.variationLines.map(function toLine(line, index) {
    const pv = [...line.principalVariationMoves];
    return {
      uci: pv[0] ?? "",
      pv,
      evaluation: absoluteNumericEvaluationToEngineEvaluation(fen, line.evaluation),
      depth: record.searchDepth,
      multipv: index + 1,
    };
  });

  return {
    fen,
    evaluation: absoluteNumericEvaluationToEngineEvaluation(fen, record.evaluation),
    depth: record.searchDepth,
    lines,
  };
}

function trimEvaluationLines(evaluation: FullMoveEvaluation, amount: number): FullMoveEvaluation {
  return {
    ...evaluation,
    lines: evaluation.lines.slice(0, amount),
  };
}

function notifyUpdateSafely(callback: (update: EvaluationUpdate) => void, update: EvaluationUpdate): void {
  try {
    callback(update);
  } catch (error) {
    console.error("Failed to deliver engine update to subscriber", error);
  }
}
