import { Fragment, useMemo } from "react";
import { type MoveMark, type MoveMarkResult, MoveMarks, MoveMarksIconPath, MoveMarksName } from "../lib/moveMarks.ts";
import { type MoveNode, type NodeAnalysis } from "./ChessReplay.tsx";

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

function GameAnalysisOverview({
  activeLine,
  positionEvaluations,
  moveMarks,
}: {
  activeLine: MoveNode[];
  positionEvaluations: Record<string, NodeAnalysis>;
  moveMarks: Record<string, MoveMarkResult>;
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
      side.lossSum += Math.max(0, Math.min(300, moveMark.evalLoss));
      side.marks[moveMark.mark] = (side.marks[moveMark.mark] ?? 0) + 1;
    });

    return result;
  }, [activeLine, moveMarks, positionEvaluations]);

  if (activeLine.length === 0) return null;

  const progress = activeLine.length > 0 ? summary.analyzedMoves / activeLine.length : 0;
  const whiteAccuracy =
    summary.white.movesWithMark > 0 ? (1 - summary.white.lossSum / summary.white.movesWithMark / 300) * 100 : null;
  const blackAccuracy =
    summary.black.movesWithMark > 0 ? (1 - summary.black.lossSum / summary.black.movesWithMark / 300) * 100 : null;

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="font-bold text-gray-800">Game Analysis Overview</h3>
          <p className="text-xs text-gray-500">
            {summary.analyzedMoves}/{activeLine.length} moves analyzed
          </p>
        </div>
        {progress > 0 && progress < 1 && <div className="text-xs font-medium text-gray-500">{Math.round(progress * 100)}%</div>}
      </div>

      {progress > 0 && progress < 1 && (
        <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
          <div
            className="h-full rounded-full bg-green-500 transition-all"
            style={{ width: `${Math.max(0, Math.min(100, progress * 100))}%` }}
          />
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)_64px_64px] gap-x-3 gap-y-2 text-sm items-center">
        <div />
        <div className="text-right text-xs font-semibold uppercase tracking-wide text-gray-500">White</div>
        <div className="text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Black</div>

        <div className="text-gray-700">Accuracy</div>
        <div className="text-right font-semibold text-gray-900">
          {whiteAccuracy == null ? "-" : Math.round(whiteAccuracy)}
        </div>
        <div className="text-right font-semibold text-gray-900">
          {blackAccuracy == null ? "-" : Math.round(blackAccuracy)}
        </div>

        {GameAnalysisOverviewView.moveMarksOrder
          .filter(function keepUsedMark(mark) {
            return (summary.white.marks[mark] ?? 0) > 0 || (summary.black.marks[mark] ?? 0) > 0;
          })
          .map(function renderRow(mark) {
            return (
              <Fragment key={mark}>
                <div className="flex items-center gap-2 text-gray-700">
                  <img src={MoveMarksIconPath[mark]} alt={MoveMarksName[mark]} className="w-4 h-4 shrink-0" />
                  <span>{MoveMarksName[mark]}</span>
                </div>
                <div className="text-right font-medium text-gray-900">{summary.white.marks[mark] ?? 0}</div>
                <div className="text-right font-medium text-gray-900">{summary.black.marks[mark] ?? 0}</div>
              </Fragment>
            );
          })}
      </div>
    </div>
  );
}

export default GameAnalysisOverview;
