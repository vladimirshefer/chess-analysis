import { Chess, type Move, type PieceSymbol } from "chess.js";
import { START } from "./evaluation";

interface MoveMarkLine {
  uci: string;
  evaluation: number;
}

export const MoveMarks = {
  BOOK: "BOOK",
  BEST: "BEST",
  OK: "OK",
  INACCURACY: "INACCURACY",
  MISTAKE: "MISTAKE",
  MISS: "MISS",
  BLUNDER: "BLUNDER",
  ONLY_MOVE: "ONLY_MOVE",
  BRILLIANT: "BRILLIANT",
} as const;

export const MoveMarksShort = {
  BOOK: "✓",
  BEST: "☆",
  OK: "✓",
  INACCURACY: "?!",
  MISTAKE: "?",
  MISS: "✖",
  BLUNDER: "??",
  ONLY_MOVE: "!",
  BRILLIANT: "!!",
};

export const MoveMarksName = {
  BOOK: "Book",
  BEST: "Best",
  OK: "Ok",
  INACCURACY: "Inaccuracy",
  MISTAKE: "Mistake",
  MISS: "Miss",
  BLUNDER: "Blunder",
  ONLY_MOVE: "Only Move",
  BRILLIANT: "Brilliant",
};

export const MoveMarksIconPath = {
  BOOK: "/movemarks/book.svg",
  BEST: "/movemarks/best.svg",
  OK: "/movemarks/good.svg",
  INACCURACY: "/movemarks/inaccuracy.svg",
  MISTAKE: "/movemarks/mistake.svg",
  MISS: "/movemarks/miss.svg",
  BLUNDER: "/movemarks/blunder.svg",
  ONLY_MOVE: "/movemarks/great.svg",
  BRILLIANT: "/movemarks/brilliant.svg",
};

export type MoveMark = (typeof MoveMarks)[keyof typeof MoveMarks];

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

export function classifyMoveMark(input: ClassifyMoveMarkInput): MoveMarkResult | null {
  if (input.parentLines.length === 0) return null;

  const bestLine = input.parentLines[0];
  const bestMoveUci = bestLine.uci;
  const mover = getSideToMove(input.parentFen);
  const bestEvaluation = bestLine.evaluation;
  const evalLoss = Math.max(0, normalizeEvalLoss(mover, bestEvaluation, input.playedEvaluation));
  const playedBestMove = lineMatchesSan(input.playedMoveSan, input.parentFen, bestLine);
  const baseMark = classifyBaseMark(input, playedBestMove, mover, evalLoss);
  const mark =
    isBrilliantEligibleMark(baseMark) &&
    isMaterialSacrificeWithoutImmediateRecapture(input.parentFen, input.playedMoveSan)
      ? MoveMarks.BRILLIANT
      : baseMark;

  return { mark, evalLoss, bestMoveUci };
}

function classifyBaseMark(
  input: ClassifyMoveMarkInput,
  playedBestMove: boolean,
  mover: "w" | "b",
  evalLoss: number,
): MoveMark {
  if (playedBestMove) {
    if (isOnlyMove(input.parentFen, input.parentLines)) return MoveMarks.ONLY_MOVE;
    return MoveMarks.BEST;
  }

  if (evalLoss >= 300) {
    if (
      // is still not losing
      (mover === "w" && input.playedEvaluation >= 0) ||
      (mover === "b" && input.playedEvaluation <= 0)
    ) {
      return MoveMarks.MISS;
    }
    return MoveMarks.BLUNDER;
  }
  if (evalLoss >= 170) return MoveMarks.MISTAKE;
  if (evalLoss >= 80) return MoveMarks.INACCURACY;
  return MoveMarks.OK;
}

function getSideToMove(fen: string): "w" | "b" {
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
  return normalizeEvalLoss(mover, bestEvaluation, secondEvaluation) >= 150;
}

function isBrilliantEligibleMark(mark: MoveMark): boolean {
  return mark === MoveMarks.BEST || mark === MoveMarks.OK || mark === MoveMarks.ONLY_MOVE;
}

function isMaterialSacrificeWithoutImmediateRecapture(parentFen: string, playedMoveSan: string): boolean {
  try {
    const board = new Chess(parentFen === START ? undefined : parentFen);
    const playedMove = board.move(playedMoveSan);
    if (!playedMove) return false;

    const offeredSquare = playedMove.to;
    const legalCaptures = board.moves({ verbose: true }).filter(function capturesMovedPiece(move) {
      return move.to === offeredSquare && typeof move.captured === "string";
    });
    if (legalCaptures.length === 0) return false;

    const capturedByPlayedMoveValue = pieceValue(playedMove.captured);
    const boardAfterPlayedMoveFen = board.fen();

    for (const opponentCapture of legalCaptures) {
      const pieceLostValue = pieceValue(opponentCapture.captured);
      const materialSwing = capturedByPlayedMoveValue - pieceLostValue;
      if (materialSwing >= 0) continue;
      if (hasImmediateRecapture(boardAfterPlayedMoveFen, opponentCapture)) continue;
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

function pieceValue(piece: PieceSymbol | undefined): number {
  if (piece === "p") return 100;
  if (piece === "n") return 300;
  if (piece === "b") return 300;
  if (piece === "r") return 500;
  if (piece === "q") return 900;
  return 0;
}

function hasImmediateRecapture(boardAfterPlayedMoveFen: string, opponentCapture: Move): boolean {
  const board = new Chess(boardAfterPlayedMoveFen);
  const capture = board.move({
    from: opponentCapture.from,
    to: opponentCapture.to,
    promotion: opponentCapture.promotion,
  });
  if (!capture) return false;

  return board.moves({ verbose: true }).some(function isRecapture(move) {
    return move.to === opponentCapture.to && typeof move.captured === "string";
  });
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
