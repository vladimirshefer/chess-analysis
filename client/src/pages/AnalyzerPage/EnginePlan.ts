import { Chess, type Square } from "chess.js";

const TRACKED_PLAN_PIECES_PER_SIDE = 2;
const MAX_PLAN_ARROWS = 5;

export namespace AnalyzerPageEnginePlan {
  export type UciMove = string;
  export type CustomArrow = [Square, Square];

  export interface PlanView {
    arrows: CustomArrow[];
    captureSquares: Square[];
  }

  interface TrackedPiece {
    color: "w" | "b";
    type: string;
    square: string;
  }

  export function toPlanView(fen: string, lineUci: UciMove[]): PlanView {
    if (!fen || lineUci.length === 0) {
      return emptyPlanView();
    }

    let game: Chess;
    try {
      game = new Chess(fen);
    } catch {
      return emptyPlanView();
    }

    const trackedByColor = {
      w: [] as TrackedPiece[],
      b: [] as TrackedPiece[],
    };
    const arrows: CustomArrow[] = [];
    const captureSquares: Square[] = [];

    for (const uciMove of lineUci) {
      if (arrows.length >= MAX_PLAN_ARROWS) break;
      if (uciMove.length < 4) return emptyPlanView();

      const from = uciMove.substring(0, 2) as Square;
      const to = uciMove.substring(2, 4) as Square;
      const promotion = uciMove[4];
      const movingPiece = game.get(from);
      if (!movingPiece) return emptyPlanView();

      const trackedPieces = trackedByColor[movingPiece.color];
      const trackedPiece = trackedPieces.find(function findTrackedPiece(candidate) {
        return (
          candidate.square === from && candidate.color === movingPiece.color && candidate.type === movingPiece.type
        );
      });

      let moveResult;
      try {
        moveResult = game.move({
          from,
          to,
          promotion: promotion || "q",
        });
      } catch {
        return emptyPlanView();
      }
      if (!moveResult) return emptyPlanView();

      if (trackedPiece) {
        trackedPiece.square = moveResult.to;
        trackedPiece.type = moveResult.promotion ?? moveResult.piece;
        arrows.push([from, to]);
        if (moveResult.captured) captureSquares.push(moveResult.to);
        continue;
      }

      if (trackedPieces.length >= TRACKED_PLAN_PIECES_PER_SIDE) continue;

      trackedPieces.push({
        color: movingPiece.color,
        type: moveResult.promotion ?? moveResult.piece,
        square: moveResult.to,
      });
      arrows.push([from, to]);
      if (moveResult.captured) captureSquares.push(moveResult.to);
    }

    return {
      arrows,
      captureSquares,
    };
  }

  function emptyPlanView(): PlanView {
    return {
      arrows: [],
      captureSquares: [],
    };
  }
}
