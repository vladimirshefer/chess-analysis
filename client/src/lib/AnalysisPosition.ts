import { Chess } from "chess.js";
import { AnalysisGame } from "./AnalysisGame.ts";
import { type ChessEngineLine, type FullMoveEvaluation } from "./ChessEngine.ts";

export namespace AnalysisPosition {
  export type DisplayEngineLine = AnalysisGame.DisplayEngineLine;
  export type NodeAnalysis = AnalysisGame.NodeAnalysis;

  export function uciToSanLine(uciString: string, baseFen: string): string[] {
    const tempGame = new Chess(baseFen);
    const uciMoves = uciString.split(" ");
    const sanMoves: string[] = [];

    for (const uciMove of uciMoves) {
      try {
        const move = tempGame.move({
          from: uciMove.substring(0, 2),
          to: uciMove.substring(2, 4),
          promotion: uciMove[4] || "q",
        });
        if (!move) break;
        sanMoves.push(move.san);
      } catch {
        break;
      }
    }

    return sanMoves;
  }

  export function toDisplayLines(baseFen: string, lines: ChessEngineLine[]): DisplayEngineLine[] {
    return lines
      .map(function toDisplayLine(line) {
        const sanMoves = uciToSanLine(line.pv.join(" "), baseFen);
        if (sanMoves.length === 0) return null;

        return {
          suggestedMove: sanMoves[0],
          suggestedMoveUci: line.uci,
          engineLineUci: line.pv,
          engineLine: sanMoves.join(" "),
          evaluation: line.evaluation,
          depth: line.depth,
          lineRank: line.multipv,
        };
      })
      .filter(function keepLine(line): line is DisplayEngineLine {
        return line !== null;
      });
  }

  export function toNodeAnalysis(baseFen: string, evaluation: FullMoveEvaluation, isFinal: boolean): NodeAnalysis {
    let settledMaterialBalance: number | null = null;

    if (isFinal) {
      const topLine = evaluation.lines[0];
      const tempGame = new Chess(baseFen);
      const pieceValueByType = {
        p: 100,
        n: 300,
        b: 300,
        r: 500,
        q: 900,
        k: 0,
      } as const;

      function getMaterialBalance(): number {
        let materialBalance = 0;

        tempGame.board().forEach(function scanRank(rank) {
          rank.forEach(function scanSquare(piece) {
            if (!piece) return;
            const value = pieceValueByType[piece.type];
            materialBalance += piece.color === "w" ? value : -value;
          });
        });

        return materialBalance;
      }

      if (topLine) {
        for (const uciMove of topLine.pv) {
          const move = tempGame.move({
            from: uciMove.substring(0, 2),
            to: uciMove.substring(2, 4),
            promotion: uciMove[4] || "q",
          });
          if (!move) break;
          if (typeof move.captured !== "string") {
            settledMaterialBalance = getMaterialBalance();
            break;
          }
        }
      }
    }

    return {
      fen: evaluation.fen,
      evaluation: evaluation.evaluation,
      settledMaterialBalance,
      depth: evaluation.depth,
      lines: toDisplayLines(baseFen, evaluation.lines),
      isFinal,
      source: "engine",
    };
  }
}
