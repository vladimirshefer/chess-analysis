import { forwardRef, type ReactNode } from "react";
import type { CustomSquareRenderer } from "react-chessboard/dist/chessboard/types";
import { MoveMark } from "../lib/moveMarks";

export function createMoveMarkSquareRenderer(delegate: {
  getMark(square: string): MoveMark | undefined;
}): CustomSquareRenderer {
  return forwardRef<HTMLDivElement, { children: ReactNode; square: string; style: Record<string, string | number> }>(
    function MoveMarkSquareRenderer({ children, square, style }, ref) {
      const mark = delegate.getMark(square);
      return (
        <div ref={ref} style={{ ...style, position: "relative" }}>
          {children}
          {mark ? (
            <span
              style={{
                position: "absolute",
                top: "-15%",
                right: "-15%",
                width: "50%",
                height: "50%",
                backgroundImage: `url("${getMoveMarkIconPath(mark)}")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "center",
                backgroundSize: "contain",
                pointerEvents: "none",
                zIndex: 20,
              }}
              aria-hidden="true"
            />
          ) : null}
        </div>
      );
    },
  ) as CustomSquareRenderer;
}

function getMoveMarkIconPath(mark: MoveMark): string {
  switch (mark) {
    case MoveMark.BOOK:
      return "/movemarks/book.svg";
    case MoveMark.BEST:
      return "/movemarks/best.svg";
    case MoveMark.OK:
      return "/movemarks/good.svg";
    case MoveMark.INACCURACY:
      return "/movemarks/inaccuracy.svg";
    case MoveMark.MISTAKE:
      return "/movemarks/mistake.svg";
    case MoveMark.MISS:
      return "/movemarks/miss.svg";
    case MoveMark.BLUNDER:
      return "/movemarks/blunder.svg";
    case MoveMark.ONLY_MOVE:
      return "/movemarks/great.svg";
    case MoveMark.BRILLIANT:
      return "/movemarks/brilliant.svg";
    default:
      return "/movemarks/good.svg";
  }
}
