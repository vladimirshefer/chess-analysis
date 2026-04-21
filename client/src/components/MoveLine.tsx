import { useEffect, useMemo, useRef, type MouseEvent as ReactMouseEvent } from "react";
import { PortableGameNotation } from "../lib/PortableGameNotation";

export function MoveLine({
  mainLinePgn,
  selectedIndex,
  onIndexSelected,
}: {
  mainLinePgn: string;
  selectedIndex: number;
  onIndexSelected: (index: number) => void;
}) {
  const moves = useMemo(
    function parseMainLineMoves() {
      return PortableGameNotation.parseMainLineMoves(mainLinePgn);
    },
    [mainLinePgn],
  );
  const moveRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartScrollLeftRef = useRef(0);
  const draggedRef = useRef(false);

  useEffect(
    function keepSelectedMoveVisible() {
      if (selectedIndex < 0) return;
      moveRefs.current[selectedIndex]?.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    },
    [selectedIndex],
  );

  if (moves.length === 0) {
    return <div className="w-full max-w-180 min-h-9 rounded-md border border-gray-200 bg-gray-50" />;
  }

  function onMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    isDraggingRef.current = true;
    draggedRef.current = false;
    dragStartXRef.current = event.clientX;
    dragStartScrollLeftRef.current = event.currentTarget.scrollLeft;
  }

  function onMouseMove(event: ReactMouseEvent<HTMLDivElement>) {
    if (!isDraggingRef.current) return;
    const offsetX = event.clientX - dragStartXRef.current;
    if (Math.abs(offsetX) > 4) draggedRef.current = true;
    event.currentTarget.scrollLeft = dragStartScrollLeftRef.current - offsetX;
  }

  function onMouseEnd() {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
  }

  function onClickCapture(event: ReactMouseEvent<HTMLDivElement>) {
    if (!draggedRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    draggedRef.current = false;
  }

  return (
    <div className="w-full max-w-180 rounded-md border border-gray-200 bg-gray-50 px-2 py-1">
      <div
        className="overflow-x-auto no-scrollbar cursor-grab active:cursor-grabbing touch-pan-x"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseEnd}
        onMouseLeave={onMouseEnd}
        onClickCapture={onClickCapture}
      >
        <div className="flex items-center gap-1 min-w-max">
          {moves.map(function renderMove(move, index) {
            const isSelected = index === selectedIndex;
            const showMoveNumber = index % 2 === 0;
            return (
              <button
                key={`${index}-${move.san}`}
                ref={function saveMoveRef(element) {
                  moveRefs.current[index] = element;
                }}
                onClick={function handleClick() {
                  onIndexSelected(index);
                }}
                className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-semibold whitespace-nowrap transition-colors ${isSelected ? "bg-indigo-600 text-white" : "text-gray-700 hover:bg-gray-200"}`}
              >
                {showMoveNumber && (
                  <span
                    className={`text-[10px] ${isSelected ? "text-indigo-100" : "text-gray-400"}`}
                  >{`${Math.floor(index / 2) + 1}.`}</span>
                )}
                <span>{move.san}</span>
                {move.mark && <img src={getMoveMarkIconPath(move.mark)} alt={move.mark} className="h-3.5 w-3.5" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function getMoveMarkIconPath(mark: PortableGameNotation.NativeMoveMark): string {
  switch (mark) {
    case PortableGameNotation.NativeMoveMarks.GOOD:
      return "/movemarks/great.svg";
    case PortableGameNotation.NativeMoveMarks.BRILLIANT:
      return "/movemarks/brilliant.svg";
    case PortableGameNotation.NativeMoveMarks.INACCURACY:
      return "/movemarks/inaccuracy.svg";
    case PortableGameNotation.NativeMoveMarks.MISTAKE:
      return "/movemarks/mistake.svg";
    case PortableGameNotation.NativeMoveMarks.BLUNDER:
      return "/movemarks/blunder.svg";
    default:
      return "/movemarks/good.svg";
  }
}
