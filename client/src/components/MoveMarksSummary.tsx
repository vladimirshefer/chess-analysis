import { type MoveMark, MoveMarks, MoveMarksIconPath, MoveMarksName } from "../lib/moveMarks.ts";

namespace MoveMarksSummaryView {
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

function MoveMarksSummary({
  marks,
  className = "justify-center",
}: {
  marks: Record<string, number>;
  className?: string;
}) {
  return (
    <div className={`flex gap-3 flex-wrap items-center ${className}`}>
      {MoveMarksSummaryView.moveMarksOrder
        .filter((mark) => (marks[mark] ?? 0) > 0)
        .map((mark) => (
          <div className={"flex gap-1"} key={mark}>
            <div className="flex items-center">
              <img src={MoveMarksIconPath[mark]} alt={MoveMarksName[mark]} className="w-[1em] h-[1em] shrink-0" />
            </div>
            <div className="text-right font-semibold text-gray-900">{marks[mark]}</div>
          </div>
        ))}
    </div>
  );
}

export default MoveMarksSummary;
