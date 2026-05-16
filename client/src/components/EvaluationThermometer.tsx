import { type AbsoluteNumericEvaluation, Evaluations } from "../lib/evaluation";

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
  settledMaterialBalance,
  orientation,
  className = "",
}: {
  evaluation: AbsoluteNumericEvaluation | null;
  settledMaterialBalance?: number | null;
  orientation: "white" | "black";
  className?: string;
}) {
  const segments = getThermometerSegments(evaluation, orientation);
  const evaluationBoundary = getThermometerBoundaryPercent(evaluation, orientation);
  const materialBoundary =
    settledMaterialBalance === null || settledMaterialBalance === undefined
      ? null
      : getThermometerBoundaryPercent(settledMaterialBalance, orientation);
  const sideBelowMaterialLine =
    materialBoundary === null ? null : materialBoundary < evaluationBoundary ? segments.topSide : segments.bottomSide;
  const label = evaluation === null ? "--" : Evaluations.toString(evaluation);
  function dropSign(s: string): string {
    return s.startsWith("-") || s.startsWith("+") ? s.substring(1) : s;
  }
  const labelWhite = evaluation >= 0 ? dropSign(label) : "";
  const labelBlack = evaluation <= 0 ? dropSign(label) : "";

  return (
    <div className={`relative shadow-inner group ${className}`.trim()}>
      <div className="absolute top-1/2 -translate-y-1/2 z-20 border hidden group-hover:block border-gray-300 bg-white/95 px-1 py-0.5 text-center text-md font-mono font-bold text-gray-700 shadow-sm">
        {label}
      </div>
      <div
        className={`absolute z-20 ${orientation == "white" ? "bottom-0" : ""} px-1 py-0.5 
                       text-center text-[8px] font-mono font-bold text-gray-700 shadow-sm`}
      >
        {labelWhite}
      </div>
      <div
        className={`absolute ${orientation == "black" ? "bottom-0" : ""} z-20 px-1 py-0.5 
                    text-center text-[8px] font-mono font-bold text-gray-100 shadow-sm`}
      >
        {labelBlack}
      </div>
      {materialBoundary !== null ? (
        <div
          className={`absolute left-0 right-0 z-10 h-0.5 -translate-y-1/2 ${
            sideBelowMaterialLine === "white" ? "bg-[#fbb]" : "bg-[#611]"
          }`}
          style={{ top: `${materialBoundary}%` }}
        />
      ) : null}
      <div className="absolute left-0 right-0 top-1/2 z-10 h-px -translate-y-1/2 bg-gray-400" />
      <div className="flex h-full flex-col">
        <div
          className={segments.topSide === "white" ? "bg-gray-50" : "bg-gray-900"}
          style={{ flexGrow: segments.topShare }}
        />
        <div
          className={segments.bottomSide === "white" ? "bg-gray-50" : "bg-gray-900"}
          style={{ flexGrow: segments.bottomShare }}
        />
      </div>
    </div>
  );
}

function getThermometerValue(evaluation: AbsoluteNumericEvaluation | null): number {
  if (evaluation === null) return 0;
  return Math.max(-1, Math.min(1, evaluation / 600));
}

function getThermometerBoundaryPercent(
  evaluation: AbsoluteNumericEvaluation | null,
  orientation: "white" | "black",
): number {
  const whiteShare = (getThermometerValue(evaluation) + 1) / 2;
  return (orientation === "black" ? whiteShare : 1 - whiteShare) * 100;
}

function getThermometerSegments(
  evaluation: AbsoluteNumericEvaluation | null,
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
