import { Chess } from "chess.js";
import { toComparableEvaluationScore, type EngineEvaluation, START } from "./evaluation";

interface MoveMarkLine {
  uci: string;
  evaluation: number;
}

export const MoveMark = {
  BEST: "Best",
  OK: "Ok",
  INACCURACY: "Inaccuracy",
  MISTAKE: "Mistake",
  BLUNDER: "Blunder",
  ONLY_MOVE: "Only Move",
  BRILLIANT: "Brilliant",
} as const;

export type MoveMark = (typeof MoveMark)[keyof typeof MoveMark];

export interface MoveMarkResult {
  mark: MoveMark;
  evalLoss: number;
  bestMoveUci: string | null;
}

interface ClassifyMoveMarkInput {
  parentFen: string;
  playedMoveSan: string;
  playedEvaluation: number;
  parentLines: MoveMarkLine[];
}

export function toMoveMarkEvaluation(evaluation: EngineEvaluation): number {
  return toComparableEvaluationScore(evaluation);
}

export function classifyMoveMark(input: ClassifyMoveMarkInput): MoveMarkResult | null {
  if (input.parentLines.length === 0) return null;

  const bestLine = input.parentLines[0];
  const bestMoveUci = bestLine.uci;
  const mover = getSideToMove(input.parentFen);
  const bestEvaluation = bestLine.evaluation;
  const evalLoss = Math.max(0, normalizeEvalLoss(mover, bestEvaluation, input.playedEvaluation));
  const playedBestMove = lineMatchesSan(input.playedMoveSan, input.parentFen, bestLine);

  if (playedBestMove) {
    if (isOnlyMove(input.parentFen, input.parentLines)) {
      return { mark: MoveMark.ONLY_MOVE, evalLoss, bestMoveUci };
    }

    if (isBrilliantMove(input.playedMoveSan, input.parentFen, input.parentLines)) {
      return { mark: MoveMark.BRILLIANT, evalLoss, bestMoveUci };
    }

    return { mark: MoveMark.BEST, evalLoss, bestMoveUci };
  }

  if (evalLoss >= 3) return { mark: MoveMark.BLUNDER, evalLoss, bestMoveUci };
  if (evalLoss >= 1.7) return { mark: MoveMark.MISTAKE, evalLoss, bestMoveUci };
  if (evalLoss >= 0.8) return { mark: MoveMark.INACCURACY, evalLoss, bestMoveUci };
  return { mark: MoveMark.OK, evalLoss, bestMoveUci };
}

function getSideToMove(fen: string): "w" | "b" {
  if (fen === START) return "w";
  return fen.split(" ")[1] === "b" ? "b" : "w";
}

function normalizeEvalLoss(mover: "w" | "b", bestEvaluation: number, playedEvaluation: number): number {
  return mover === "w" ? bestEvaluation - playedEvaluation : playedEvaluation - bestEvaluation;
}

function isOnlyMove(parentFen: string, parentLines: MoveMarkLine[]): boolean {
  if (parentLines.length < 2) return false;
  const mover = getSideToMove(parentFen);
  const bestEvaluation = parentLines[0].evaluation;
  const secondEvaluation = parentLines[1].evaluation;
  return normalizeEvalLoss(mover, bestEvaluation, secondEvaluation) >= 1.5;
}

function isBrilliantMove(playedMoveSan: string, parentFen: string, parentLines: MoveMarkLine[]): boolean {
  if (parentLines.length < 2) return false;
  if (!/[x+#]/.test(playedMoveSan)) return false;

  const mover = getSideToMove(parentFen);
  const bestEvaluation = parentLines[0].evaluation;
  const secondEvaluation = parentLines[1].evaluation;
  return normalizeEvalLoss(mover, bestEvaluation, secondEvaluation) >= 0.75;
}

function lineMatchesSan(playedMoveSan: string, parentFen: string, line: MoveMarkLine): boolean {
  const firstMoveSan = getFirstMoveSan(parentFen, line);
  return firstMoveSan === playedMoveSan;
}

function getFirstMoveSan(parentFen: string, line: MoveMarkLine): string | null {
  try {
    const chess = new Chess(parentFen === START ? undefined : parentFen);
    const firstMove = line.uci;
    if (!firstMove) return null;

    const move = chess.move({
      from: firstMove.substring(0, 2),
      to: firstMove.substring(2, 4),
      promotion: firstMove[4] || "q",
    });
    return move?.san ?? null;
  } catch {
    return null;
  }
}
