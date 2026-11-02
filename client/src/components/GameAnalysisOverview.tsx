import { useMemo } from "react";
import type { MoveMarkResult } from "../lib/moveMarks.ts";
import { GameAnalysisSummary } from "../lib/GameAnalysisSummary.ts";
import MoveMarksSummary from "./MoveMarksSummary.tsx";
import { AnalysisGame } from "../lib/AnalysisGame.ts";
import type { MoveNode } from "../lib/GameTree.ts";

type NodeAnalysis = AnalysisGame.NodeAnalysis;

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
    return GameAnalysisSummary.buildGameSummary(activeLine, positionEvaluations, moveMarks);
  }, [activeLine, moveMarks, positionEvaluations]);

  if (activeLine.length === 0) return null;

  const whiteAccuracy = summary.whiteAccuracy;
  const blackAccuracy = summary.blackAccuracy;

  return (
    <div>
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
