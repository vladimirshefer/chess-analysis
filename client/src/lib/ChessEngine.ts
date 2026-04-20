import { sharedEvaluationCache } from "./chess-engine/EvaluationCache.ts";
import { CachedChessEngine } from "./chess-engine/CachedChessEngine.ts";
import { NativeChessEngine } from "./chess-engine/NativeChessEngine.ts";
import { PersistentChessEngine } from "./chess-engine/PersistentChessEngine.ts";
import { QueuedChessEngine } from "./chess-engine/QueuedChessEngine.ts";
import type { EngineEvaluation } from "./evaluation";

export interface ChessEngineLine {
  /** UCI = Universal Chess Interface */
  uci: string;
  /** Principal variation. Example: ["e2e4", "e7e5"]*/
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
  isFinal?: boolean;
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

  getEvaluation(fen: string, minDepth?: number): Promise<FullMoveEvaluation | null>;

  getLines(fen: string, minDepth?: number, amount?: number): Promise<ChessEngineLine[] | null>;
}

export function createChessEngine(): ChessEngine {
  return new CachedChessEngine(
    new PersistentChessEngine(new QueuedChessEngine(new NativeChessEngine())),
    sharedEvaluationCache,
  );
}

let singleton: ChessEngine | null = null;

export function getChessEngine(): ChessEngine {
  if (!singleton) singleton = createChessEngine();
  return singleton;
}
