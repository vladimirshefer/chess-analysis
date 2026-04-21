import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { classifyMoveMark, MoveMarks, type MoveMarkResult } from "./moveMarks";
import { START } from "./evaluation";

describe("classifyMoveMark", function suite() {
  it("marks best true material sacrifice without immediate recapture as BRILLIANT", function testCase() {
    const parentFen = "6kn/8/8/8/8/8/8/6KR w - - 0 1";
    const bestUci = "h1h8";
    const result = classifyOrThrow({
      parentFen,
      playedMoveSan: sanFromUci(parentFen, bestUci),
      playedEvaluation: 1,
      parentLines: [
        { uci: bestUci, evaluation: 1 },
        { uci: "g1f2", evaluation: 0.9 },
      ],
    });

    expect(result.mark).toBe(MoveMarks.BRILLIANT);
  });

  it("does not mark BRILLIANT when immediate recapture exists", function testCase() {
    const parentFen = "6k1/8/3p4/8/2N2P2/8/8/6K1 w - - 0 1";
    const bestUci = "c4e5";
    const result = classifyOrThrow({
      parentFen,
      playedMoveSan: sanFromUci(parentFen, bestUci),
      playedEvaluation: 0.6,
      parentLines: [
        { uci: bestUci, evaluation: 0.6 },
        { uci: "g1f2", evaluation: 0.3 },
      ],
    });

    expect(result.mark).toBe(MoveMarks.BEST);
  });

  it("does not mark BRILLIANT for capture/check SAN without real sacrifice", function testCase() {
    const parentFen = "6kr/8/8/8/8/8/8/6KR w - - 0 1";
    const bestUci = "h1h8";
    const playedMoveSan = sanFromUci(parentFen, bestUci);
    const result = classifyOrThrow({
      parentFen,
      playedMoveSan,
      playedEvaluation: 1,
      parentLines: [
        { uci: bestUci, evaluation: 1 },
        { uci: "g1f2", evaluation: 0.9 },
      ],
    });

    expect(/[x+#]/.test(playedMoveSan)).toBe(true);
    expect(result.mark).toBe(MoveMarks.BEST);
  });

  it("marks BRILLIANT for sacrifice when base mark is OK", function testCase() {
    const parentFen = "6kn/8/8/8/8/8/8/6KR w - - 0 1";
    const playedUci = "h1h8";
    const result = classifyOrThrow({
      parentFen,
      playedMoveSan: sanFromUci(parentFen, playedUci),
      playedEvaluation: 0.45,
      parentLines: [
        { uci: "g1f2", evaluation: 0.6 },
        { uci: "g1f1", evaluation: 0.5 },
      ],
    });

    expect(result.mark).toBe(MoveMarks.BRILLIANT);
  });

  it("never marks BRILLIANT below brilliant-eligible quality tier", function testCase() {
    const parentFen = "6kn/8/8/8/8/8/8/6KR w - - 0 1";
    const playedUci = "h1h8";
    const result = classifyOrThrow({
      parentFen,
      playedMoveSan: sanFromUci(parentFen, playedUci),
      playedEvaluation: 0,
      parentLines: [
        { uci: "g1f2", evaluation: 1 },
        { uci: "g1f1", evaluation: 0.95 },
      ],
    });

    expect(result.mark).toBe(MoveMarks.INACCURACY);
  });

  it("upgrades ONLY_MOVE to BRILLIANT when true sacrifice exists", function testCase() {
    const parentFen = "6kn/8/8/8/8/8/8/6KR w - - 0 1";
    const bestUci = "h1h8";
    const result = classifyOrThrow({
      parentFen,
      playedMoveSan: sanFromUci(parentFen, bestUci),
      playedEvaluation: 1,
      parentLines: [
        { uci: bestUci, evaluation: 1 },
        { uci: "g1f2", evaluation: -1 },
      ],
    });

    expect(result.mark).toBe(MoveMarks.BRILLIANT);
  });
});

function classifyOrThrow(input: Parameters<typeof classifyMoveMark>[0]): MoveMarkResult {
  const result = classifyMoveMark(input);
  if (!result) throw new Error("Expected move mark result");
  return result;
}

function sanFromUci(parentFen: string, uci: string): string {
  const board = new Chess(parentFen === START ? undefined : parentFen);
  const move = board.move({
    from: uci.substring(0, 2),
    to: uci.substring(2, 4),
    promotion: uci[4] || "q",
  });
  if (!move?.san) throw new Error(`Invalid move ${uci} for position ${parentFen}`);
  return move.san;
}
