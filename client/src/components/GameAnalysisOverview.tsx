import { useMemo } from "react";
import { type MoveMark, type MoveMarkResult, MoveMarks, MoveMarksIconPath, MoveMarksName } from "../lib/moveMarks.ts";
import { GameAnalysisSummary } from "../lib/GameAnalysisSummary.ts";
import ValuesHistogram from "./ValuesHistogram.tsx";
import { AnalysisGame } from "../lib/AnalysisGame.ts";
import type { MoveNode } from "../lib/GameTree.ts";

type NodeAnalysis = AnalysisGame.NodeAnalysis;

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
    return GameAnalysisSummary.buildGameSummary(activeLine, positionEvaluations, moveMarks);
  }, [activeLine, moveMarks, positionEvaluations]);

  if (activeLine.length === 0) return null;

  const progress = summary.progress;
  const currentHistogramIndex = summary.histogramNodeIds.indexOf(currentNodeId);
  const whiteAccuracy = summary.whiteAccuracy;
  const blackAccuracy = summary.blackAccuracy;

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

      {summary.histogramValues.length > 0 && (
        <div className="space-y-1">
          <div className="rounded-md overflow-hidden border border-gray-200 bg-white">
            <ValuesHistogram
              className={`${reviewAsWhite ? "" : "scale-y-[-1]"}`}
              values={summary.histogramValues}
              secondaryValues={summary.materialValues}
              currentIndex={currentHistogramIndex >= 0 ? currentHistogramIndex : undefined}
              onValueClick={(index) => {
                const nodeId = summary.histogramNodeIds[index];
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
            .filter((mark) => (summary.whiteMarks[mark] ?? 0) > 0)
            .map((mark) => (
              <div className={"flex gap-1"} key={mark}>
                <div className="flex items-center">
                  <img src={MoveMarksIconPath[mark]} alt={MoveMarksName[mark]} className="w-[1em] h-[1em] shrink-0" />
                </div>
                <div className="text-right font-semibold text-gray-900">{summary.whiteMarks[mark] ?? 0}</div>
              </div>
            ))}
        </div>
        <div className={"flex gap-3 flex-wrap items-center justify-center"}>
          {GameAnalysisOverviewView.moveMarksOrder
            .filter((mark) => (summary.blackMarks[mark] ?? 0) > 0)
            .map((mark) => (
              <div className={"flex gap-1"} key={mark}>
                <div className="flex items-center">
                  <img src={MoveMarksIconPath[mark]} alt={MoveMarksName[mark]} className="w-[1em] h-[1em] shrink-0" />
                </div>
                <div className="text-right font-medium text-gray-900">{summary.blackMarks[mark] ?? 0}</div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

export default GameAnalysisOverview;
