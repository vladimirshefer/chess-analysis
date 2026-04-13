import { sharedEvaluationCache } from "./EvaluationCache.ts";
import { CachedChessEngine } from "./chess-engine/CachedChessEngine.ts";
import { NativeChessEngine } from "./chess-engine/NativeChessEngine.ts";
import { QueuedChessEngine } from "./chess-engine/QueuedChessEngine.ts";
import type { EngineEvaluation } from "./evaluation";

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

export type EngineEvaluationPriority = "IMMEDIATE" | "NEXT" | "BACKGROUND";

export const EngineEvaluationPriorities: { [key in EngineEvaluationPriority]: EngineEvaluationPriority } = {
  IMMEDIATE: "IMMEDIATE",
  NEXT: "NEXT",
  BACKGROUND: "BACKGROUND",
} as const;

export interface ChessEngine {
  evaluate(
    fen: string,
    options: EvaluationRequest,
    priority: EngineEvaluationPriority,
    onUpdate?: (update: EvaluationUpdate) => void,
  ): Promise<FullMoveEvaluation>;

  getEvaluation(fen: string, minDepth?: number): FullMoveEvaluation | null;

  getLines(fen: string, minDepth?: number, amount?: number): ChessEngineLine[] | null;
}

export function createChessEngine(): ChessEngine {
  return new CachedChessEngine(new QueuedChessEngine(new NativeChessEngine()), sharedEvaluationCache);
}

let singleton: ChessEngine | null = null;

export function getChessEngine(): ChessEngine {
  if (!singleton) singleton = createChessEngine();
  return singleton;
}
