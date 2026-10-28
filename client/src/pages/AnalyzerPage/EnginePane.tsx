import { CURRENT_ENGINE_NAME } from "../../lib/chess-engine/ChessEngine.ts";
import { EngineLine } from "./EngineLine.tsx";
import { AnalysisGame } from "../../lib/AnalysisGame.ts";

type NodeAnalysis = AnalysisGame.NodeAnalysis;
type DisplayEngineLine = AnalysisGame.DisplayEngineLine;

export function EnginePane({
  currentAnalysis,
  statusText,
  applyLine,
}: {
  currentAnalysis: NodeAnalysis | null;
  statusText: string;
  applyLine: (line: DisplayEngineLine) => void;
}) {
  const statusLineText = statusText === "Analysis Complete" ? `${statusText} · ${CURRENT_ENGINE_NAME}` : statusText;

  return (
    <div className="flex flex-col gap-2 shadow rounded">
      <div className="flex flex-col">
        {(!currentAnalysis || (currentAnalysis.lines.length === 0 && !currentAnalysis.isFinal)) && (
          <div className="text-xs text-gray-400 italic">Calculating best moves...</div>
        )}
        {currentAnalysis?.lines.map((line, index) => (
          <EngineLine key={currentAnalysis.fen + index} line={line} apply={() => applyLine(line)}></EngineLine>
        ))}
        <div className="text-[8px] text-gray-400 text-right">{statusLineText}</div>
      </div>
    </div>
  );
}
