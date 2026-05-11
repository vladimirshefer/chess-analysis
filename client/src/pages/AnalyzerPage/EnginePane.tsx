import { CURRENT_ENGINE_NAME } from "../../lib/ChessEngine.ts";
import { EngineDepthSelector } from "./EngineDepthSelector.tsx";
import { Analytics } from "../../lib/Analytics.ts";
import RenderIcon from "../../components/RenderIcon.tsx";
import { GiStrikingArrows } from "react-icons/gi";
import { FaMagnifyingGlassPlus } from "react-icons/fa6";
import { EngineLine } from "./EngineLine.tsx";
import { AnalysisGame } from "../../lib/AnalysisGame.ts";

type NodeAnalysis = AnalysisGame.NodeAnalysis;
type DisplayEngineLine = AnalysisGame.DisplayEngineLine;

export function EnginePane({
  currentAnalysis,
  showPlans,
  setShowPlans,
  selectedDepth,
  setSelectedDepth,
  statusText,
  runDeepAnalysis,
  applyLine,
}: {
  currentAnalysis: NodeAnalysis | null;
  showPlans: boolean;
  setShowPlans: (value: boolean) => void;
  selectedDepth: number;
  setSelectedDepth: (value: number) => void;
  statusText: string;
  runDeepAnalysis: () => void;
  applyLine: (line: DisplayEngineLine) => void;
}) {
  const statusLineText = statusText === "Analysis Complete" ? `${statusText} · ${CURRENT_ENGINE_NAME}` : statusText;

  return (
    <div className="flex flex-col gap-2 shadow rounded">
      <div className="flex items-start justify-between gap-4 border-b border-gray-100">
        <div className={"grow"}></div>
        <div className="flex items-center">
          <EngineDepthSelector
            selectedDepth={selectedDepth}
            onSelectDepth={(depth: number) => {
              Analytics.trackEvent("engine_depth_selected", { depth, previous_depth: selectedDepth });
              setSelectedDepth(depth);
            }}
          />
          <button
            className={`inline-flex items-center px-3 py-1.5 text-xs font-bold ${showPlans ? "text-olive-700 border-olive-300 bg-olive-50 hover:bg-olive-100" : "text-gray-600 border-gray-300 bg-white hover:bg-gray-100"}`}
            onClick={() => setShowPlans(!showPlans)}
            title={"Show engine plan arrows"}
          >
            <RenderIcon iconType={GiStrikingArrows} className="text-xs" />
          </button>
          <button
            className="inline-flex items-center px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => runDeepAnalysis()}
            title={"Run deeper analysis"}
          >
            <RenderIcon iconType={FaMagnifyingGlassPlus} className="text-xs" />
          </button>
        </div>
      </div>
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
