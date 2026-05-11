import { Evaluations } from "../../lib/evaluation.ts";
import { AnalysisGame } from "../../lib/AnalysisGame.ts";

type DisplayEngineLine = AnalysisGame.DisplayEngineLine;

export function EngineLine({ line, apply }: { line: DisplayEngineLine; apply: () => void }) {
  const scoreValue = line.evaluation;
  return (
    <button
      onClick={() => apply()}
      className="flex flex-col gap-2 px-2 hover:bg-olive-100 group transition-all text-left rounded"
    >
      <div className="flex items-baseline w-full gap-2">
        <span className="text-xs font-bold text-gray-300">{line.lineRank}.</span>
        <span className="font-bold text-gray-900 font-mono text-nowrap">{line.suggestedMove}</span>
        <div className="text-xs text-gray-700 font-mono truncate grow opacity-70">
          {line.engineLine.split(" ").slice(1).join(" ")}
        </div>
        <div className="flex items-center gap-1">
          <span
            className={`text-sm font-bold px-2 font-mono rounded ${scoreValue > 0 ? "bg-white text-black group-hover:bg-olive-200" : scoreValue < 0 ? "bg-black text-white group-hover:bg-olive-900" : "text-gray-500"}`}
          >
            {Evaluations.toString(line.evaluation)}
          </span>
          <span className="text-xs text-gray-400">d{line.depth}</span>
        </div>
      </div>
    </button>
  );
}
