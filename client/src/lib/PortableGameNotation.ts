export namespace PortableGameNotation {
  /**
   * Algebraic Notation. Superset of SAN, UCI,
   *
   * SAN format. Example: "Ne4", "ed"
   * UCI format. Example: "e7e8q"
   * Full format. Example: "e4xe5"
   *
   * "x" = capture
   * "+" = check
   * "#" = mate
   * "=" = promotion
   * "N" = knight
   * "B" = bishop
   * "R" = rook
   * "Q" = queen
   * "K" = king
   * pawn has no piece name
   * "0-0" = short castle
   * "0-0-0" = long castle
   * Simplified Pattern: "({piece name}|{start square})({x}?)({piece name}?)({end square})((={piece name}?)|({piece name lower}))({+#}?)"
   *
   * Other promotion examples: "e8Q", "e8=Q", e8(Q), "e8/Q"
   * Nullmove: "0000"
   */
  export type Move = string;

  export interface GameTree {
    makeMove(move: Move): Position;
  }

  export interface Position {
    currentPgn: string;
    linePgn: string;
    resultingFen: string;
    lastMove: Move | null;
  }

  export const NativeMoveMarks = {
    GOOD: "!",
    BRILLIANT: "!!",
    INACCURACY: "?!",
    MISTAKE: "?",
    BLUNDER: "??",
  } as const;

  export type NativeMoveMark = "!" | "!!" | "?!" | "?" | "??";

  export interface MoveToken {
    san: Move;
    mark: NativeMoveMark | null;
  }

  const RESULT_TOKENS = new Set(["1-0", "0-1", "1/2-1/2", "*"]);
  const MARK_SUFFIXES: NativeMoveMark[] = [
    NativeMoveMarks.BLUNDER,
    NativeMoveMarks.INACCURACY,
    NativeMoveMarks.BRILLIANT,
    NativeMoveMarks.MISTAKE,
    NativeMoveMarks.GOOD,
  ];

  export function withNativeMoveMark(move: Move, mark: NativeMoveMark | null | undefined): Move {
    if (!mark) return move;
    return `${move}${mark}`;
  }

  export function parseMainLineMoves(pgn: string): MoveToken[] {
    const noHeaders = pgn.replace(/\[[^\]]*]/g, " ");
    const noVariations = stripVariations(noHeaders);
    const noComments = noVariations.replace(/\{[^}]*\}/g, " ");
    const noNags = noComments.replace(/\$\d+/g, " ");
    const rawTokens = noNags.split(/\s+/).filter(Boolean);
    const tokens: MoveToken[] = [];

    rawTokens.forEach(function parseRawToken(rawToken) {
      const token = stripMoveNumberPrefix(rawToken);
      if (!token || RESULT_TOKENS.has(token)) return;

      const parsedToken = parseMoveToken(token);
      if (!parsedToken.san) return;
      tokens.push(parsedToken);
    });

    return tokens;
  }

  export function parseMoveToken(token: string): MoveToken {
    const match = MARK_SUFFIXES.find(function findMark(suffix) {
      return token.endsWith(suffix);
    });
    if (!match) {
      return {
        san: token,
        mark: null,
      };
    }

    const san = token.slice(0, token.length - match.length);
    if (!san) {
      return {
        san: token,
        mark: null,
      };
    }

    return {
      san,
      mark: match,
    };
  }

  export function toPgnFromMoves(moves: MoveToken[]): string {
    const tokens = moves
      .map(function toToken(move, index) {
        const annotatedSan = withNativeMoveMark(move.san, move.mark);
        if (index % 2 === 0) {
          const moveNumber = Math.floor(index / 2) + 1;
          return `${moveNumber}. ${annotatedSan}`;
        }

        return annotatedSan;
      })
      .filter(Boolean);

    return tokens.join(" ").trim();
  }

  function stripMoveNumberPrefix(token: string): string {
    const withoutNumber = token.replace(/^\d+\.(\.\.)?/, "");
    if (withoutNumber === "...") return "";
    return withoutNumber;
  }

  function stripVariations(pgn: string): string {
    let depth = 0;
    let result = "";

    for (const char of pgn) {
      if (char === "(") {
        depth += 1;
        continue;
      }
      if (char === ")") {
        depth = Math.max(0, depth - 1);
        continue;
      }
      if (depth === 0) {
        result += char;
      }
    }

    return result;
  }
}
