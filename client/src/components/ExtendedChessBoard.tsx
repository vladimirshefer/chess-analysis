import { Chessboard } from "react-chessboard";
import { createContext, type ComponentProps, forwardRef, type ReactNode, useContext, useMemo, useState } from "react";
import { Chess, type Move, type Square } from "chess.js";
import { type MoveMark, MoveMarks } from "../lib/moveMarks.ts";
import type { CustomSquareRenderer } from "react-chessboard/dist/chessboard/types";

type ChessboardPropsType = ComponentProps<typeof Chessboard>;
const MoveMarksBySquareContext = createContext<Record<string, MoveMark>>({});

export function ExtendedChessBoard(
  props: {
    currentPositionGame: Chess;
    makeMove: (mv: { from: string; to: string; promotion?: string }) => void;
    moveMarksBySquare: Record<string, MoveMark>;
  } & ChessboardPropsType,
) {
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);

  const selectedSquareMoves = useMemo<Move[]>(
    function buildSelectedSquareMoves() {
      if (!selectedSquare) return [];

      try {
        return props.currentPositionGame.moves({ square: selectedSquare, verbose: true });
      } catch {
        return [];
      }
    },
    [props.currentPositionGame, selectedSquare],
  );

  function onDrop(sourceSquare: string, targetSquare: string) {
    props.makeMove({ from: sourceSquare, to: targetSquare, promotion: "q" });
    setSelectedSquare(null);
    return true;
  }

  function onSquareClick(square: string) {
    const clickedSquare = square as Square;

    function isMovableOwnPiece(targetSquare: Square) {
      const piece = props.currentPositionGame.get(targetSquare);
      if (!piece) return false;
      if (piece.color !== props.currentPositionGame.turn()) return false;
      return props.currentPositionGame.moves({ square: targetSquare, verbose: true }).length > 0;
    }

    if (!selectedSquare) {
      if (isMovableOwnPiece(clickedSquare)) setSelectedSquare(clickedSquare);
      return;
    }

    if (selectedSquare === clickedSquare) {
      setSelectedSquare(null);
      return;
    }

    props.makeMove({ from: selectedSquare, to: clickedSquare, promotion: "q" });
    setSelectedSquare(null);

    if (isMovableOwnPiece(clickedSquare)) {
      setSelectedSquare(clickedSquare);
      return;
    }

    setSelectedSquare(null);
  }

  const boardSquareStyles = useMemo(
    function buildBoardSquareStyles() {
      const stylesBySquare: Record<string, Record<string, string | number>> = {};

      function mergeSquareStyle(square: string, style: Record<string, string | number>) {
        const current = stylesBySquare[square];
        if (!current) {
          stylesBySquare[square] = style;
          return;
        }

        const currentBoxShadow = typeof current.boxShadow === "string" ? current.boxShadow : "";
        const nextBoxShadow = typeof style.boxShadow === "string" ? style.boxShadow : "";
        const mergedBoxShadow =
          currentBoxShadow && nextBoxShadow
            ? `${currentBoxShadow}, ${nextBoxShadow}`
            : nextBoxShadow || currentBoxShadow || undefined;

        stylesBySquare[square] = {
          ...current,
          ...style,
          ...(mergedBoxShadow ? { boxShadow: mergedBoxShadow } : {}),
        };
      }

      if (selectedSquare) {
        mergeSquareStyle(selectedSquare, {
          backgroundColor: "#fff6",
          boxShadow: "inset 0 0 0 3px #fff6",
        });
      }

      selectedSquareMoves.forEach(function applyLegalTargetStyle(move) {
        const isCapture = move.isCapture();
        mergeSquareStyle(move.to, {
          ...(isCapture
            ? {
                boxShadow: "inset 0 0 0 4px #fff6",
              }
            : {
                background: "radial-gradient(circle, #fff6 0%, #fff6 22%, #fff0 26%)",
              }),
        });
      });

      return stylesBySquare;
    },
    [selectedSquare, selectedSquareMoves],
  );

  return (
    <MoveMarksBySquareContext.Provider value={props.moveMarksBySquare}>
      <Chessboard
        {...props}
        onSquareClick={onSquareClick}
        onPieceDrop={onDrop}
        customSquareStyles={{ ...(props.customSquareStyles ?? {}), ...boardSquareStyles }}
        customSquare={MoveMarkSquareRenderer}
        id="AnalysisBoard"
      />
    </MoveMarksBySquareContext.Provider>
  );
}

const MoveMarkSquareRenderer = forwardRef<
  HTMLDivElement,
  { children: ReactNode; square: string; style: Record<string, string | number> }
>(function MoveMarkSquareRenderer({ children, square, style }, ref) {
  const moveMarksBySquare = useContext(MoveMarksBySquareContext);
  const mark = moveMarksBySquare[square];

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
}) as CustomSquareRenderer;

function getMoveMarkIconPath(mark: MoveMark): string {
  switch (mark) {
    case MoveMarks.BOOK:
      return "/movemarks/book.svg";
    case MoveMarks.BEST:
      return "/movemarks/best.svg";
    case MoveMarks.OK:
      return "/movemarks/good.svg";
    case MoveMarks.INACCURACY:
      return "/movemarks/inaccuracy.svg";
    case MoveMarks.MISTAKE:
      return "/movemarks/mistake.svg";
    case MoveMarks.MISS:
      return "/movemarks/miss.svg";
    case MoveMarks.BLUNDER:
      return "/movemarks/blunder.svg";
    case MoveMarks.ONLY_MOVE:
      return "/movemarks/great.svg";
    case MoveMarks.BRILLIANT:
      return "/movemarks/brilliant.svg";
    default:
      return "/movemarks/good.svg";
  }
}
