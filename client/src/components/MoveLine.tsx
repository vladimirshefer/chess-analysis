import { useEffect, useRef } from "react";
import type { MoveNode } from "../lib/GameTree.ts";
import { type MoveMark, type MoveMarkResult, MoveMarks, MoveMarksIconPath, MoveMarksName } from "../lib/moveMarks.ts";

const QUIET_MARKS: MoveMark[] = [MoveMarks.BOOK, MoveMarks.BEST, MoveMarks.OK];

export function MoveLine({
  activeLine,
  moveMarks,
  currentNodeId,
  selectNode,
}: {
  activeLine: MoveNode[];
  moveMarks: Record<string, MoveMarkResult>;
  currentNodeId: string;
  selectNode: (id: string) => void;
}) {
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  useEffect(
    function keepSelectedMoveVisible() {
      selectedRef.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    },
    [currentNodeId],
  );

  return (
    <div className="w-full max-w-180 min-h-9 overflow-x-auto rounded-md border border-gray-200 bg-gray-50 px-2 py-1">
      <div className="flex items-center gap-1 min-w-max">
        {activeLine.map(function renderMove(move, index) {
          const isSelected = move.id === currentNodeId;
          const markValue = moveMarks[move.id]?.mark;
          const mark = markValue && !QUIET_MARKS.includes(markValue) ? markValue : null;
          return (
            <button
              key={move.id}
              ref={isSelected ? selectedRef : null}
              onClick={function handleClick() {
                selectNode(move.id);
              }}
              className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-semibold whitespace-nowrap transition-colors ${isSelected ? "bg-indigo-600 text-white" : "text-gray-700 hover:bg-gray-200"}`}
            >
              {index % 2 === 0 && (
                <span
                  className={`text-[10px] ${isSelected ? "text-indigo-100" : "text-gray-400"}`}
                >{`${index / 2 + 1}.`}</span>
              )}
              <span>{move.san}</span>
              {mark && <img src={MoveMarksIconPath[mark]} alt={MoveMarksName[mark]} className="h-3.5 w-3.5" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
