import { describe, expect, it } from "vitest";
import { UniversalChessInterface } from "./UniversalChessInterface.ts";

describe("UniversalChessInterface.parseInfoLine", function suite() {
  it("returns null for non-info lines", function testCase() {
    expect(UniversalChessInterface.parseInfoLine("bestmove e2e4")).toBeNull();
  });

  it("parses centipawn info lines", function testCase() {
    const parsed = UniversalChessInterface.parseInfoLine(
      "info depth 14 multipv 2 score cp 34 nodes 123 nps 456 time 789 pv e2e4 e7e5 g1f3",
    );

    expect(parsed).toEqual({
      depth: 14,
      multiPrincipalVariation: 2,
      scoreCentipawn: 34,
      nodes: 123,
      nodesPerSecond: 456,
      timeMs: 789,
      principalVariation: ["e2e4", "e7e5", "g1f3"],
    });
  });

  it("parses mate scores and lowerbound", function testCase() {
    const parsed = UniversalChessInterface.parseInfoLine("info depth 20 score mate -3 lowerbound pv h7h8q");

    expect(parsed).toEqual({
      depth: 20,
      mateInMoves: -3,
      scoreBound: "lowerbound",
      principalVariation: ["h7h8q"],
    });
  });

  it("parses upperbound when present", function testCase() {
    const parsed = UniversalChessInterface.parseInfoLine("info depth 12 score cp -40 upperbound pv c7c5");

    expect(parsed).toEqual({
      depth: 12,
      scoreCentipawn: -40,
      scoreBound: "upperbound",
      principalVariation: ["c7c5"],
    });
  });

  it("ignores invalid numeric tokens", function testCase() {
    const parsed = UniversalChessInterface.parseInfoLine("info depth x multipv q score cp nope nodes n/a pv e2e4");

    expect(parsed).toEqual({
      principalVariation: ["e2e4"],
    });
  });

  it("keeps parsing with extra unknown tokens", function testCase() {
    const parsed = UniversalChessInterface.parseInfoLine(
      "info junk aaa depth 18 weird zzz currmove e2e4 currmovenumber 23 pv e2e4 e7e5",
    );

    expect(parsed).toEqual({
      depth: 18,
      currentMove: "e2e4",
      currentMoveNumber: 23,
      principalVariation: ["e2e4", "e7e5"],
    });
  });
});

describe("UniversalChessInterface.parseEngineLine", function suite() {
  it("parses bestmove with ponder", function testCase() {
    expect(UniversalChessInterface.parseEngineLine("bestmove e2e4 ponder e7e5")).toEqual({
      type: "bestmove",
      data: { bestMove: "e2e4", ponderMove: "e7e5" },
    });
  });

  it("parses id lines", function testCase() {
    expect(UniversalChessInterface.parseEngineLine("id name Stockfish 16.1")).toEqual({
      type: "id",
      data: { field: "name", value: "Stockfish 16.1" },
    });
  });

  it("parses option lines with vars", function testCase() {
    expect(
      UniversalChessInterface.parseEngineLine(
        "option name Analysis Style type combo default Balanced var Balanced var Aggressive var Solid",
      ),
    ).toEqual({
      type: "option",
      data: {
        name: "Analysis Style",
        optionType: "combo",
        defaultValue: "Balanced",
        variables: ["Balanced", "Aggressive", "Solid"],
      },
    });
  });

  it("parses ready markers", function testCase() {
    expect(UniversalChessInterface.parseEngineLine("uciok")).toEqual({
      type: "uciok",
      data: { marker: "uciok" },
    });
    expect(UniversalChessInterface.parseEngineLine("readyok")).toEqual({
      type: "readyok",
      data: { marker: "readyok" },
    });
  });

  it("returns null for unknown lines", function testCase() {
    expect(UniversalChessInterface.parseEngineLine("unknown token")).toBeNull();
  });
});
