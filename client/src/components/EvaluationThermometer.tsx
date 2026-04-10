import {
  formatEvaluation,
  toComparableEvaluationScore,
  type EngineEvaluation,
} from "../lib/evaluation";

interface EvaluationThermometerProps {
  evaluation: EngineEvaluation | null;
  orientation: "white" | "black";
  className?: string;
}

interface ThermometerSegments {
  topShare: number;
  bottomShare: number;
  topSide: "white" | "black";
  bottomSide: "white" | "black";
}

/**
 * `orientation` follows board orientation, not the winning side.
 * - `white`: White is visually at the bottom, Black at the top.
 * - `black`: Black is visually at the bottom, White at the top.
 * The thermometer mirrors that layout, so advantage grows toward the side that is visually favored.
 * Outer sizing and shape come from `className`, for example `w-8 min-h-[480px] rounded-full`.
 */
function EvaluationThermometer({
  evaluation,
  orientation,
  className = "",
}: EvaluationThermometerProps) {
  const segments = getThermometerSegments(evaluation, orientation);
  const label = evaluation === null ? "--" : formatEvaluation(evaluation);

  return (
    <div
      className={`relative overflow-hidden border border-gray-300 bg-gray-200 shadow-inner ${className}`.trim()}
    >
      <div className="absolute inset-x-0 top-1/2 h-px bg-gray-500/50 z-10" />
      <div className="absolute top-1/2 -translate-y-1/2 z-20 border border-gray-300 bg-white/95 px-1 py-0.5 text-center text-[7px] font-mono font-bold text-gray-700 shadow-sm">
        {label}
      </div>
      <div className="flex h-full flex-col">
        <div
          className={
            segments.topSide === "white" ? "bg-gray-50" : "bg-gray-900"
          }
          style={{ flexGrow: segments.topShare }}
        />
        <div
          className={
            segments.bottomSide === "white" ? "bg-gray-50" : "bg-gray-900"
          }
          style={{ flexGrow: segments.bottomShare }}
        />
      </div>
    </div>
  );
}

function getThermometerValue(evaluation: EngineEvaluation | null): number {
  if (evaluation === null) return 0;
  return Math.max(-1, Math.min(1, toComparableEvaluationScore(evaluation) / 6));
}

function getThermometerSegments(
  evaluation: EngineEvaluation | null,
  orientation: "white" | "black",
): ThermometerSegments {
  const whiteShare = (getThermometerValue(evaluation) + 1) / 2;

  if (orientation === "black") {
    return {
      topShare: whiteShare,
      bottomShare: 1 - whiteShare,
      topSide: "white",
      bottomSide: "black",
    };
  }

  return {
    topShare: 1 - whiteShare,
    bottomShare: whiteShare,
    topSide: "black",
    bottomSide: "white",
  };
}

export default EvaluationThermometer;
