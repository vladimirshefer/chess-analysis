import { Chess, type Square } from "chess.js";

export namespace AnalyzerPageEnginePlan {
  export type UciMove = string;
  export type CustomArrow = [Square, Square];

  interface TrackedPiece {
    color: "w" | "b";
    type: string;
    square: string;
  }

  export function toPlanArrows(fen: string, lineUci: UciMove[], trackedPiecesPerSide: number): CustomArrow[] {
    if (!fen || lineUci.length === 0 || trackedPiecesPerSide <= 0) return [];

    let game: Chess;
    try {
      game = new Chess(fen);
    } catch {
      return [];
    }

    const trackedByColor = {
      w: [] as TrackedPiece[],
      b: [] as TrackedPiece[],
    };
    const arrows: CustomArrow[] = [];

    for (const uciMove of lineUci) {
      if (uciMove.length < 4) return [];

      const from = uciMove.substring(0, 2) as Square;
      const to = uciMove.substring(2, 4) as Square;
      const promotion = uciMove[4];
      const movingPiece = game.get(from);
      if (!movingPiece) return [];

      const trackedPieces = trackedByColor[movingPiece.color];
      const trackedPiece = trackedPieces.find(function findTrackedPiece(candidate) {
        return candidate.square === from && candidate.color === movingPiece.color && candidate.type === movingPiece.type;
      });

      let moveResult;
      try {
        moveResult = game.move({
          from,
          to,
          promotion: promotion || "q",
        });
      } catch {
        return [];
      }
      if (!moveResult) return [];

      if (trackedPiece) {
        trackedPiece.square = moveResult.to;
        trackedPiece.type = moveResult.promotion ?? moveResult.piece;
        arrows.push([from, to]);
        continue;
      }

      if (trackedPieces.length >= trackedPiecesPerSide) continue;

      trackedPieces.push({
        color: movingPiece.color,
        type: moveResult.promotion ?? moveResult.piece,
        square: moveResult.to,
      });
      arrows.push([from, to]);
    }

    return arrows;
  }
}
