import { Fragment, useMemo } from "react";
import { type MoveMark, type MoveMarkResult, MoveMarks, MoveMarksIconPath, MoveMarksName } from "../lib/moveMarks.ts";
import { type MoveNode, type NodeAnalysis } from "./ChessReplay.tsx";
import ValuesHistogram from "./ValuesHistogram.tsx";

namespace GameAnalysisOverviewView {
  export const moveMarksOrder: MoveMark[] = [
    MoveMarks.BRILLIANT,
    MoveMarks.ONLY_MOVE,
    MoveMarks.BEST,
    MoveMarks.OK,
    MoveMarks.BOOK,
    MoveMarks.INACCURACY,
    MoveMarks.MISTAKE,
    MoveMarks.MISS,
    MoveMarks.BLUNDER,
  ];
}

/**
 * Used in a game accuracy calculation.
 * Centipawns.
 * This is a cap of a loss considered for accuracy calculation.
 * The assumption is that loss more than this is a blunder anyway.
 */
const EVAL_LOSS_CLAMP = 300;

function GameAnalysisOverview({
  activeLine,
  positionEvaluations,
  moveMarks,
  selectNode,
  currentNodeId,
  reviewAsWhite = true,
}: {
  activeLine: MoveNode[];
  positionEvaluations: Record<string, NodeAnalysis>;
  moveMarks: Record<string, MoveMarkResult>;
  selectNode: (nodeId: string) => void;
  currentNodeId: string;
  reviewAsWhite?: boolean;
}) {
  const summary = useMemo(() => {
    const result = {
      analyzedMoves: activeLine.filter(function keepAnalyzedMove(node) {
        return !!positionEvaluations[node.fen]?.isFinal;
      }).length,
      white: {
        movesWithMark: 0,
        lossSum: 0,
        marks: {} as Record<string, number>,
      },
      black: {
        movesWithMark: 0,
        lossSum: 0,
        marks: {} as Record<string, number>,
      },
    };

    activeLine.forEach(function collectMove(node, index) {
      const side = index % 2 === 0 ? result.white : result.black;
      const moveMark = moveMarks[node.id];
      if (!moveMark) return;
      side.movesWithMark += 1;
      side.lossSum += Math.max(0, Math.min(EVAL_LOSS_CLAMP, moveMark.evalLoss));
      side.marks[moveMark.mark] = (side.marks[moveMark.mark] ?? 0) + 1;
    });

    return result;
  }, [activeLine, moveMarks, positionEvaluations]);

  const histogramValues = useMemo(() => {
    return activeLine.reduce(
      function collectValues(result, node) {
        const analysis = positionEvaluations[node.fen];
        if (!analysis?.isFinal) return result;
        result.evaluationValues.push(analysis.evaluation);
        result.materialValues.push(analysis.settledMaterialBalance ?? analysis.evaluation);
        result.nodeIds.push(node.id);
        return result;
      },
      { evaluationValues: [] as number[], materialValues: [] as number[], nodeIds: [] as string[] },
    );
  }, [activeLine, positionEvaluations]);

  if (activeLine.length === 0) return null;

  const progress = activeLine.length > 0 ? summary.analyzedMoves / activeLine.length : 0;
  const currentHistogramIndex = histogramValues.nodeIds.indexOf(currentNodeId);
  const whiteAccuracy =
    summary.white.movesWithMark > 0
      ? (1 - summary.white.lossSum / summary.white.movesWithMark / EVAL_LOSS_CLAMP) * 100
      : null;
  const blackAccuracy =
    summary.black.movesWithMark > 0
      ? (1 - summary.black.lossSum / summary.black.movesWithMark / EVAL_LOSS_CLAMP) * 100
      : null;

  return (
    <div className="">
      {progress > 0 && progress < 1 && (
        <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
          <div
            className="h-full rounded-full bg-green-500 transition-all"
            style={{ width: `${Math.max(0, Math.min(100, progress * 100))}%` }}
          />
        </div>
      )}

      {histogramValues.evaluationValues.length > 0 && (
        <div className="space-y-1">
          <div className="rounded-md overflow-hidden border border-gray-200 bg-white">
            <ValuesHistogram
              className={`${reviewAsWhite ? "" : "scale-y-[-1]"}`}
              values={histogramValues.evaluationValues}
              secondaryValues={histogramValues.materialValues}
              currentIndex={currentHistogramIndex >= 0 ? currentHistogramIndex : undefined}
              onValueClick={(index) => {
                const nodeId = histogramValues.nodeIds[index];
                if (!nodeId) return;
                selectNode(nodeId);
              }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 p-4 gap-4 items-center">
        <div className={"flex flex-col items-center"}>
          <div className="font-semibold text-sm tracking-wide text-gray-500">White</div>
          <div className="font-semibold text-lg text-gray-900">
            {whiteAccuracy == null ? "-" : Math.round(whiteAccuracy)}
          </div>
          <div className={"text-[8px]"}>{"Accuracy"}</div>
        </div>
        <div className={"flex flex-col items-center"}>
          <div className="font-semibold text-sm tracking-wide text-gray-500">Black</div>
          <div className="font-semibold text-lg text-gray-900">
            {blackAccuracy == null ? "-" : Math.round(blackAccuracy)}
          </div>
          <div className={"text-[8px]"}>{"Accuracy"}</div>
        </div>

        <div className={"flex gap-3 flex-wrap items-center justify-center"}>
          {GameAnalysisOverviewView.moveMarksOrder
            .filter((mark) => (summary.white.marks[mark] ?? 0) > 0)
            .map((mark) => (
              <div className={"flex gap-1"} key={mark}>
                <div className="flex items-center">
                  <img src={MoveMarksIconPath[mark]} alt={MoveMarksName[mark]} className="w-[1em] h-[1em] shrink-0" />
                </div>
                <div className="text-right font-semibold text-gray-900">{summary.white.marks[mark] ?? 0}</div>
              </div>
            ))}
        </div>
        <div className={"flex gap-3 flex-wrap items-center justify-center"}>
          {GameAnalysisOverviewView.moveMarksOrder
            .filter((mark) => (summary.black.marks[mark] ?? 0) > 0)
            .map((mark) => (
              <div className={"flex gap-1"} key={mark}>
                <div className="flex items-center">
                  <img src={MoveMarksIconPath[mark]} alt={MoveMarksName[mark]} className="w-[1em] h-[1em] shrink-0" />
                </div>
                <div className="text-right font-medium text-gray-900">{summary.black.marks[mark] ?? 0}</div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

export default GameAnalysisOverview;
