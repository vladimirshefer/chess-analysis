import { Chess } from "chess.js";
import { ForsythEdwardsNotation } from "./ForsythEdwardsNotation.ts";

export const GameResult = {
  WHITE_WIN: "1-0",
  BLACK_WIN: "0-1",
  DRAW: "1/2-1/2",
} as const;

export type GameResult = (typeof GameResult)[keyof typeof GameResult];

export type EngineEvaluation =
  | { kind: "cp"; pawns: number }
  | { kind: "mate"; moves: number }
  | { kind: "result"; result: GameResult };

export function formatEvaluation(evaluation: EngineEvaluation): string {
  switch (evaluation.kind) {
    case "cp":
      return evaluation.pawns >= 0 ? `+${evaluation.pawns.toFixed(1)}` : evaluation.pawns.toFixed(1);
    case "mate":
      return evaluation.moves >= 0 ? `M${evaluation.moves}` : `-M${Math.abs(evaluation.moves)}`;
    case "result":
      return evaluation.result;
  }
}

export function toComparableEvaluationScore(evaluation: EngineEvaluation): number {
  switch (evaluation.kind) {
    case "cp":
      return evaluation.pawns;
    case "mate":
      return evaluation.moves >= 0 ? 1000 - Math.abs(evaluation.moves) : -1000 + Math.abs(evaluation.moves);
    case "result":
      if (evaluation.result === GameResult.WHITE_WIN) return 2000;
      if (evaluation.result === GameResult.BLACK_WIN) return -2000;
      return 0;
  }
}

export function areEvaluationsEqual(left: EngineEvaluation, right: EngineEvaluation): boolean {
  if (left.kind !== right.kind) return false;

  switch (left.kind) {
    case "cp":
      return left.pawns === (right as Extract<EngineEvaluation, { kind: "cp" }>).pawns;
    case "mate":
      return left.moves === (right as Extract<EngineEvaluation, { kind: "mate" }>).moves;
    case "result":
      return left.result === (right as Extract<EngineEvaluation, { kind: "result" }>).result;
  }
}

export const START = "start";
export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export function parseEngineEvaluation(fen: string, cpScore?: number, mateScore?: number): EngineEvaluation {
  const sideToMove = ForsythEdwardsNotation.getSideToMove(fen);
  const perspective = sideToMove === "b" ? -1 : 1;

  if (typeof cpScore === "number") {
    return {
      kind: "cp",
      pawns: (cpScore * perspective) / 100,
    };
  }

  if (typeof mateScore === "number") {
    return {
      kind: "mate",
      moves: mateScore * perspective,
    };
  }

  return { kind: "cp", pawns: 0 };
}

export function getTerminalEvaluation(fen: string): EngineEvaluation | null {
  const chess = new Chess(fen);
  if (!chess.isGameOver()) return null;

  if (chess.isCheckmate()) {
    const sideToMove = ForsythEdwardsNotation.getSideToMove(fen);
    return {
      kind: "result",
      result: sideToMove === "w" ? GameResult.BLACK_WIN : GameResult.WHITE_WIN,
    };
  }

  if (chess.isDraw()) {
    return { kind: "result", result: GameResult.DRAW };
  }

  return null;
}
