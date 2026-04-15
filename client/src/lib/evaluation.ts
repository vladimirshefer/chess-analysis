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

export interface MixedPositionEvaluation {
  centipawnEvaluation?: number;
  mateInMoves?: number;
}

export function evalToNum(evaluation: MixedPositionEvaluation): AbsoluteNumericEvaluation {
  if (typeof evaluation.mateInMoves === "number") {
    if (evaluation.mateInMoves === 0) {
      throw new Error("mateInMoves cannot be 0");
    }

    const distance = clampInteger(Math.abs(evaluation.mateInMoves), 1, MATE_MAX_DISTANCE);
    const encodedDistance = MATE_MAX_DISTANCE - distance;
    const encodedMate = MATE_BASE + encodedDistance;
    return evaluation.mateInMoves > 0 ? encodedMate : -encodedMate;
  }

  return clampInteger(evaluation.centipawnEvaluation ?? 0, -MAX_CENTIPAWN, MAX_CENTIPAWN);
}

export function numToEval(score: AbsoluteNumericEvaluation): MixedPositionEvaluation {
  const normalizedScore = Math.trunc(score);
  const absoluteScore = Math.abs(normalizedScore);

  if (absoluteScore >= MATE_BASE) {
    const encodedDistance = absoluteScore - MATE_BASE;
    const distance = clampInteger(MATE_MAX_DISTANCE - encodedDistance, 1, MATE_MAX_DISTANCE);
    return { mateInMoves: normalizedScore > 0 ? distance : -distance };
  }

  return {
    centipawnEvaluation: clampInteger(normalizedScore, -MAX_CENTIPAWN, MAX_CENTIPAWN),
  };
}

export function engineEvaluationToAbsoluteNumericEvaluation(
  fen: string,
  evaluation: EngineEvaluation,
): AbsoluteNumericEvaluation {
  switch (evaluation.kind) {
    case "cp":
      return evalToNum({ centipawnEvaluation: evaluation.pawns * 100 });
    case "mate":
      return evalToNum({ mateInMoves: evaluation.moves });
    case "result": {
      if (evaluation.result === GameResult.DRAW) return 0;
      const sideToMove = ForsythEdwardsNotation.getSideToMove(fen);
      const sideToMoveWon =
        (sideToMove === "w" && evaluation.result === GameResult.WHITE_WIN) ||
        (sideToMove === "b" && evaluation.result === GameResult.BLACK_WIN);
      return sideToMoveWon ? TERMINAL_RESULT_SCORE : -TERMINAL_RESULT_SCORE;
    }
  }
}

export function absoluteNumericEvaluationToEngineEvaluation(
  fen: string,
  score: AbsoluteNumericEvaluation,
): EngineEvaluation {
  const normalizedScore = Math.trunc(score);
  if (Math.abs(normalizedScore) === TERMINAL_RESULT_SCORE) {
    const sideToMove = ForsythEdwardsNotation.getSideToMove(fen);
    const sideToMoveWon = normalizedScore > 0;
    if (sideToMove === "w") {
      return {
        kind: "result",
        result: sideToMoveWon ? GameResult.WHITE_WIN : GameResult.BLACK_WIN,
      };
    }

    return {
      kind: "result",
      result: sideToMoveWon ? GameResult.BLACK_WIN : GameResult.WHITE_WIN,
    };
  }

  if (normalizedScore === 0) {
    const terminal = getTerminalEvaluation(fen);
    if (terminal?.kind === "result" && terminal.result === GameResult.DRAW) return terminal;
  }

  const mixed = numToEval(normalizedScore);
  if (typeof mixed.mateInMoves === "number") {
    return {
      kind: "mate",
      moves: mixed.mateInMoves,
    };
  }

  return {
    kind: "cp",
    pawns: (mixed.centipawnEvaluation ?? 0) / 100,
  };
}

function clampInteger(value: number, min: number, max: number): number {
  const integer = Math.trunc(value);
  if (integer < min) return min;
  if (integer > max) return max;
  return integer;
}
