import { AnalysisGame } from "./AnalysisGame.ts";
import type { MoveNode } from "./GameTree.ts";
import { GameTreeUtils, type GameTree } from "./GameTree.ts";
import { OpeningsBook } from "./OpeningsBook.ts";
import { START } from "./evaluation.ts";
import { classifyMoveMark, type MoveMarkResult, MoveMarks } from "./moveMarks.ts";

export namespace GameAnalysisSummary {
  export type NodeAnalysis = AnalysisGame.NodeAnalysis;

  interface SideSummary {
    movesWithMark: number;
    lossSum: number;
    marks: Record<string, number>;
  }

  export interface GameAnalysisSummaryResult {
    analyzedMoves: number;
    totalMoves: number;
    progress: number;
    whiteAccuracy: number | null;
    blackAccuracy: number | null;
    whiteMarks: Record<string, number>;
    blackMarks: Record<string, number>;
    histogramValues: number[];
    materialValues: number[];
    histogramNodeIds: string[];
  }

  /**
   * Used in a game accuracy calculation.
   * Centipawns.
   * This is a cap of a loss considered for accuracy calculation.
   * The assumption is that loss more than this is a blunder anyway.
   */
  const EVAL_LOSS_CLAMP = 300;

  export function buildMoveMarks(
    tree: GameTree,
    analysesByFen: Record<string, NodeAnalysis>,
  ): Record<string, MoveMarkResult> {
    const marksByNodeId: Record<string, MoveMarkResult> = {};

    Object.values(tree).forEach(function classifyNode(node) {
      const movePathKey = GameTreeUtils.getPgnToPosition(node.id, tree);
      const isKnownByMovePath = movePathKey ? OpeningsBook.isKnownMovePath(movePathKey.split(" ")) : false;

      if (isKnownByMovePath) {
        marksByNodeId[node.id] = {
          mark: MoveMarks.BOOK,
          evalLoss: 0,
          bestMoveUci: null,
        };
        return;
      }

      const nodeAnalysis = analysesByFen[node.fen];
      const parentFen = node.parentId ? tree[node.parentId]?.fen : START;
      const parentAnalysis = analysesByFen[parentFen];
      if (!parentFen) return;
      if (!parentAnalysis?.isFinal || !nodeAnalysis?.isFinal) return;
      if (parentAnalysis.lines.length === 0) return;

      const mark = classifyMoveMark({
        parentFen,
        playedMoveSan: node.san,
        playedEvaluation: nodeAnalysis.evaluation,
        parentLines: parentAnalysis.lines.map(function toMoveMarkLine(line) {
          return {
            uci: line.suggestedMoveUci,
            evaluation: line.evaluation,
          };
        }),
      });

      if (mark) marksByNodeId[node.id] = mark;
    });

    return marksByNodeId;
  }

  export function buildGameSummary(
    activeLine: MoveNode[],
    positionEvaluations: Record<string, NodeAnalysis>,
    moveMarks: Record<string, MoveMarkResult>,
  ): GameAnalysisSummaryResult {
    const summary = {
      analyzedMoves: activeLine.filter(function keepAnalyzedMove(node) {
        return !!positionEvaluations[node.fen]?.isFinal;
      }).length,
      white: createSideSummary(),
      black: createSideSummary(),
    };

    activeLine.forEach(function collectMove(node, index) {
      const side = index % 2 === 0 ? summary.white : summary.black;
      const moveMark = moveMarks[node.id];
      if (!moveMark) return;
      side.movesWithMark += 1;
      side.lossSum += Math.max(0, Math.min(EVAL_LOSS_CLAMP, Math.abs(moveMark.evalLoss)));
      side.marks[moveMark.mark] = (side.marks[moveMark.mark] ?? 0) + 1;
    });

    const histogram = activeLine.reduce(
      function collectValues(result, node) {
        const analysis = positionEvaluations[node.fen];
        if (!analysis?.isFinal) return result;
        result.histogramValues.push(analysis.evaluation);
        result.materialValues.push(analysis.settledMaterialBalance ?? analysis.evaluation);
        result.histogramNodeIds.push(node.id);
        return result;
      },
      {
        histogramValues: [] as number[],
        materialValues: [] as number[],
        histogramNodeIds: [] as string[],
      },
    );

    return {
      analyzedMoves: summary.analyzedMoves,
      totalMoves: activeLine.length,
      progress: activeLine.length > 0 ? summary.analyzedMoves / activeLine.length : 0,
      whiteAccuracy: toAccuracy(summary.white),
      blackAccuracy: toAccuracy(summary.black),
      whiteMarks: summary.white.marks,
      blackMarks: summary.black.marks,
      histogramValues: histogram.histogramValues,
      materialValues: histogram.materialValues,
      histogramNodeIds: histogram.histogramNodeIds,
    };
  }

  function createSideSummary(): SideSummary {
    return {
      movesWithMark: 0,
      lossSum: 0,
      marks: {},
    };
  }

  function toAccuracy(side: SideSummary): number | null {
    if (side.movesWithMark === 0) return null;
    return (1 - side.lossSum / side.movesWithMark / EVAL_LOSS_CLAMP) * 100;
  }
}
