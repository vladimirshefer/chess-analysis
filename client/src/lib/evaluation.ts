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

export function getAbsoluteTerminalEvaluation(fen: string): AbsoluteNumericEvaluation | null {
  const chess = new Chess(fen);
  if (!chess.isGameOver()) return null;

  if (chess.isCheckmate()) {
    const sideToMove = ForsythEdwardsNotation.getSideToMove(fen);
    return sideToMove === "w"
      ? -Evaluations.absoluteNumericEvaluationOfWhiteWin()
      : Evaluations.absoluteNumericEvaluationOfWhiteWin();
  }

  if (chess.isDraw()) {
    return 0;
  }

  return null;
}

const MAX_CENTIPAWN = 500_000;
const MATE_BASE = 1_000_000;
const MATE_MAX_DISTANCE = 999_999;
const TERMINAL_RESULT_SCORE = 2_000_000;

/**
 * Canonical numeric score used for storage and ranking position evaluations.
 *
 * Encoding:
 * - `abs(value) < 1_000_000` => centipawn score (clamped to `[-500_000, 500_000]`)
 * - `abs(value)` in `[1_000_000, 1_999_998]` => mate score
 * - `value = 2_000_000` => terminal win for side to move (`kind: "result"`)
 * - `value = -2_000_000` => terminal loss for side to move (`kind: "result"`)
 * - positive means better for side to move, negative means worse for side to move
 * - for mates, faster winning mate is larger; for losing mate, later mate is larger
 *
 * Examples:
 * - `35` => +35 cp
 * - `-120` => -120 cp
 * - `1_999_994` => mate in +5
 * - `-1_999_994` => mate in -5
 * - `2_000_000` => game already won for side to move
 * - `-2_000_000` => game already lost for side to move
 */
export type AbsoluteNumericEvaluation = number;

export function evalToNum(evaluation: EngineEvaluation): AbsoluteNumericEvaluation {
  return Evaluations.absoluteNumericEvaluationOfEngineEvaluation(evaluation);
}

export namespace Evaluations {
  export function absoluteNumericEvaluationOfMate(mateInMoves: number): AbsoluteNumericEvaluation {
    if (mateInMoves === 0) {
      throw new Error("mateInMoves cannot be 0");
    }
    const distance = clampInteger(Math.abs(mateInMoves), 1, MATE_MAX_DISTANCE);
    const encodedDistance = MATE_MAX_DISTANCE - distance;
    const encodedMate = MATE_BASE + encodedDistance;
    return mateInMoves > 0 ? encodedMate : -encodedMate;
  }

  export function absoluteNumericEvaluationOfCentipawns(centipawns: number): AbsoluteNumericEvaluation {
    return clampInteger(centipawns ?? 0, -MAX_CENTIPAWN, MAX_CENTIPAWN);
  }

  export function absoluteNumericEvaluationOfWhiteWin(): AbsoluteNumericEvaluation {
    return TERMINAL_RESULT_SCORE;
  }

  export function absoluteNumericEvaluationOfEngineEvaluation(evaluation: EngineEvaluation): AbsoluteNumericEvaluation {
    if (evaluation.kind === "mate") {
      return Evaluations.absoluteNumericEvaluationOfMate(evaluation.moves);
    }
    if (evaluation.kind === "cp") {
      return Evaluations.absoluteNumericEvaluationOfCentipawns(evaluation.pawns * 100);
    }
    if (evaluation.kind === "result") {
      return evaluation.result === "0-1"
        ? -TERMINAL_RESULT_SCORE
        : evaluation.result === "1-0"
          ? TERMINAL_RESULT_SCORE
          : 0;
    }
  }

  export function toString(evaluation: AbsoluteNumericEvaluation): string {
    if (evaluation === TERMINAL_RESULT_SCORE) {
      return GameResult.WHITE_WIN;
    }
    if (evaluation === -TERMINAL_RESULT_SCORE) {
      return GameResult.BLACK_WIN;
    }

    const absoluteValue = Math.abs(evaluation);
    if (absoluteValue >= MATE_BASE) {
      const encodedDistance = absoluteValue - MATE_BASE;
      const distance = clampInteger(MATE_MAX_DISTANCE - encodedDistance, 1, MATE_MAX_DISTANCE);
      return evaluation > 0 ? `+M${distance}` : `-M${-distance}`;
    } else {
      const centipawns = clampInteger(evaluation, -MAX_CENTIPAWN, MAX_CENTIPAWN);
      const pawns = centipawns / 100;
      return (centipawns < 0 ? "-" : centipawns > 0 ? "+" : "") + Math.abs(pawns).toFixed(1);
    }
  }
}

export function absoluteNumericEvaluationToEngineEvaluation(score: AbsoluteNumericEvaluation): EngineEvaluation {
  if (Math.abs(score) === TERMINAL_RESULT_SCORE) {
    return {
      kind: "result",
      result: score > 0 ? GameResult.WHITE_WIN : GameResult.BLACK_WIN,
    };
  }
  const absoluteScore = Math.abs(score);

  if (absoluteScore >= MATE_BASE) {
    const encodedDistance = absoluteScore - MATE_BASE;
    const distance = clampInteger(MATE_MAX_DISTANCE - encodedDistance, 1, MATE_MAX_DISTANCE);
    return {
      kind: "mate",
      moves: score > 0 ? distance : -distance,
    };
  } else {
    return {
      kind: "cp",
      pawns: clampInteger(score, -MAX_CENTIPAWN, MAX_CENTIPAWN) / 100,
    };
  }
}

function clampInteger(value: number, min: number, max: number): number {
  const integer = Math.trunc(value);
  if (integer < min) return min;
  if (integer > max) return max;
  return integer;
}
