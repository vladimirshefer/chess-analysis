import { describe, expect, it } from "vitest";
import { AnalyzerPageEnginePlan } from "./EnginePlan.ts";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("AnalyzerPageEnginePlan.toPlanArrows", function suite() {
  it("tracks first two moving pieces per side and keeps later moves from same pieces", function testCase() {
    const arrows = AnalyzerPageEnginePlan.toPlanArrows(
      START_FEN,
      ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6", "f3g5", "f8c5", "g5f7"],
      2,
    );

    expect(arrows).toEqual([
      ["e2", "e4"],
      ["e7", "e5"],
      ["g1", "f3"],
      ["b8", "c6"],
      ["f3", "g5"],
      ["g5", "f7"],
    ]);
  });

  it("returns empty list for invalid fen", function testCase() {
    expect(AnalyzerPageEnginePlan.toPlanArrows("bad fen", ["e2e4"], 2)).toEqual([]);
  });

  it("returns empty list for invalid move", function testCase() {
    expect(AnalyzerPageEnginePlan.toPlanArrows(START_FEN, ["e2e5"], 2)).toEqual([]);
  });

  it("handles castling and promotion through normal board replay", function testCase() {
    const castlingArrows = AnalyzerPageEnginePlan.toPlanArrows(
      "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1",
      ["e1g1", "e8c8", "g1g2", "c8c7"],
      1,
    );
    const promotionArrows = AnalyzerPageEnginePlan.toPlanArrows("7k/P7/8/8/8/8/8/K7 w - - 0 1", ["a7a8q"], 1);

    expect(castlingArrows).toEqual([
      ["e1", "g1"],
      ["e8", "c8"],
      ["g1", "g2"],
      ["c8", "c7"],
    ]);
    expect(promotionArrows).toEqual([["a7", "a8"]]);
  });
});
