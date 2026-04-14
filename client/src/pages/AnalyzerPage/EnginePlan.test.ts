import { describe, expect, it } from "vitest";
import { AnalyzerPageEnginePlan } from "./EnginePlan.ts";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const TRACKED_PIECES_PER_SIDE = 2;
const MAX_PLAN_ARROWS = 5;

describe("AnalyzerPageEnginePlan.toPlanView", function suite() {
  it("tracks first two moving pieces per side and keeps later moves from same pieces", function testCase() {
    const planView = AnalyzerPageEnginePlan.toPlanView(
      START_FEN,
      ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6", "f3g5", "f8c5", "g5f7"],
      TRACKED_PIECES_PER_SIDE,
      MAX_PLAN_ARROWS,
    );

    expect(planView.arrows).toEqual([
      ["e2", "e4"],
      ["e7", "e5"],
      ["g1", "f3"],
      ["b8", "c6"],
      ["f3", "g5"],
      ["g5", "f7"],
    ]);
    expect(planView.captureSquares).toEqual(["f7"]);
  });

  it("returns empty list for invalid fen", function testCase() {
    expect(AnalyzerPageEnginePlan.toPlanView("bad fen", ["e2e4"], TRACKED_PIECES_PER_SIDE, MAX_PLAN_ARROWS)).toEqual({
      arrows: [],
      captureSquares: [],
    });
  });

  it("returns empty list for invalid move", function testCase() {
    expect(AnalyzerPageEnginePlan.toPlanView(START_FEN, ["e2e5"], TRACKED_PIECES_PER_SIDE, MAX_PLAN_ARROWS)).toEqual({
      arrows: [],
      captureSquares: [],
    });
  });

  it("handles castling and promotion through normal board replay", function testCase() {
    const castlingPlan = AnalyzerPageEnginePlan.toPlanView(
      "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1",
      ["e1g1", "e8c8", "g1g2", "c8c7"],
      1,
      MAX_PLAN_ARROWS,
    );
    const promotionPlan = AnalyzerPageEnginePlan.toPlanView(
      "7k/P7/8/8/8/8/8/K7 w - - 0 1",
      ["a7a8q"],
      1,
      MAX_PLAN_ARROWS,
    );

    expect(castlingPlan).toEqual({
      arrows: [
        ["e1", "g1"],
        ["e8", "c8"],
        ["g1", "g2"],
        ["c8", "c7"],
      ],
      captureSquares: [],
    });
    expect(promotionPlan).toEqual({
      arrows: [["a7", "a8"]],
      captureSquares: [],
    });
  });

  it("caps shown arrows at five", function testCase() {
    const planView = AnalyzerPageEnginePlan.toPlanView(
      START_FEN,
      ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6", "f3g5", "f8c5", "g5f7"],
      TRACKED_PIECES_PER_SIDE,
      5,
    );

    expect(planView).toEqual({
      arrows: [
        ["e2", "e4"],
        ["e7", "e5"],
        ["g1", "f3"],
        ["b8", "c6"],
        ["f3", "g5"],
      ],
      captureSquares: [],
    });
  });

  it("returns empty plan when max arrows is zero", function testCase() {
    expect(AnalyzerPageEnginePlan.toPlanView(START_FEN, ["e2e4"], TRACKED_PIECES_PER_SIDE, 0)).toEqual({
      arrows: [],
      captureSquares: [],
    });
  });
});
