import { useMemo } from "react";
import type { MoveMarkResult } from "../lib/moveMarks.ts";
import { GameAnalysisSummary } from "../lib/GameAnalysisSummary.ts";
import ValuesHistogram from "./ValuesHistogram.tsx";
import MoveMarksSummary from "./MoveMarksSummary.tsx";
import { AnalysisGame } from "../lib/AnalysisGame.ts";
import type { MoveNode } from "../lib/GameTree.ts";

type NodeAnalysis = AnalysisGame.NodeAnalysis;

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

        <MoveMarksSummary marks={summary.whiteMarks} />
        <MoveMarksSummary marks={summary.blackMarks} />
      </div>
    </div>
  );
}

export default GameAnalysisOverview;
