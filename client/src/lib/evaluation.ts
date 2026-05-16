import { Chess } from "chess.js";
import { ForsythEdwardsNotation } from "./ForsythEdwardsNotation.ts";

export const GameResult = {
  WHITE_WIN: "1-0",
  BLACK_WIN: "0-1",
  DRAW: "1/2-1/2",
} as const;

export type GameResult = (typeof GameResult)[keyof typeof GameResult];

export const START = "start";
export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

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

export const MAX_CENTIPAWN = 500_000;
export const MATE_BASE = 1_000_000;
export const MATE_MAX_DISTANCE = 999_999;
export const TERMINAL_RESULT_SCORE = 2_000_000;

/**
 * Canonical numeric score used for storage and ranking position evaluations.
 *
 * Encoding:
 * - `abs(value) < MATE_BASE` => centipawn score (clamped to `[-MAX_CENTIPAWN, MAX_CENTIPAWN]`)
 * - `abs(value)` in `[MATE_BASE, 1_999_998]` => mate score
 * - `value = TERMINAL_RESULT_SCORE` => terminal White win (`kind: "result"`)
 * - `value = -TERMINAL_RESULT_SCORE` => terminal Black win (`kind: "result"`)
 * - positive means better for White, negative means better for Black
 * - for mates, faster White mate is larger; faster Black mate is smaller
 *
 * Examples:
 * - `35` => +35 cp
 * - `-120` => -120 cp
 * - `TERMINAL_RESULT_SCORE-6` => mate in +5
 * - `-(TERMINAL_RESULT_SCORE-6)` => mate in -5
 * - `TERMINAL_RESULT_SCORE` => game already won for White
 * - `-TERMINAL_RESULT_SCORE` => game already won for Black
 */
export type AbsoluteNumericEvaluation = number;

export function parseAbsoluteEvaluation(fen: string, cpScore?: number, mateScore?: number): AbsoluteNumericEvaluation {
  const sideToMove = ForsythEdwardsNotation.getSideToMove(fen);
  const perspective = sideToMove === "w" ? 1 : -1;

  if (typeof cpScore === "number") {
    return Evaluations.absoluteNumericEvaluationOfCentipawns(cpScore * perspective);
  }

  if (typeof mateScore === "number") {
    return Evaluations.absoluteNumericEvaluationOfMate(mateScore * perspective);
  }

  return 0;
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
      return evaluation > 0 ? `+M${distance}` : `-M${distance}`;
    } else {
      const centipawns = clampInteger(evaluation, -MAX_CENTIPAWN, MAX_CENTIPAWN);
      const pawns = centipawns / 100;
      return (centipawns < 0 ? "-" : centipawns > 0 ? "+" : "") + Math.abs(pawns).toFixed(1);
    }
  }

  export function toExpectedScore(evaluation: AbsoluteNumericEvaluation, player: "w" | "b" = "w"): number {
    if (evaluation === TERMINAL_RESULT_SCORE) return player === "w" ? 1 : 0;
    if (evaluation === -TERMINAL_RESULT_SCORE) return player === "w" ? 0 : 1;
    if (Math.abs(evaluation) >= MATE_BASE) return evaluation > 0 ? (player === "w" ? 1 : 0) : player === "w" ? 0 : 1;

    const whiteExpectedScore =
      1 / (1 + Math.exp(-0.00368208 * clampInteger(evaluation, -MAX_CENTIPAWN, MAX_CENTIPAWN)));
    return player === "w" ? whiteExpectedScore : 1 - whiteExpectedScore;
  }
}

function clampInteger(value: number, min: number, max: number): number {
  const integer = Math.trunc(value);
  if (integer < min) return min;
  if (integer > max) return max;
  return integer;
}
