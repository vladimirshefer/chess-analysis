import { describe, expect, it } from "vitest";
import { AnalysisGame } from "./AnalysisGame.ts";
import { GameAnalysisSummary } from "./GameAnalysisSummary.ts";
import { MoveMarks, type MoveMarkResult } from "./moveMarks.ts";

const BLUNDER: MoveMarkResult = { mark: MoveMarks.BLUNDER, evalLoss: 300, bestMoveUci: null };

function loadLine(pgn: string) {
  const game = AnalysisGame.loadPgn(pgn);
  return AnalysisGame.getLineNodeIds(game.activeLineId, game.tree).map(function toNode(id) {
    return game.tree[id];
  });
}

function loadMoves(pgn: string) {
  return loadLine(pgn).slice(1);
}

describe("GameAnalysisSummary.buildGameSummary", function suite() {
  it("attributes a white move to white", function testCase() {
    const line = loadMoves("1. e4 e5");

    const summary = GameAnalysisSummary.buildGameSummary(line, {}, { [line[0].id]: BLUNDER });

    expect(summary.whiteMarks).toEqual({ [MoveMarks.BLUNDER]: 1 });
    expect(summary.blackMarks).toEqual({});
  });

  it("attributes a black move to black even when the line starts with it", function testCase() {
    const line = loadMoves("1. e4 e5").slice(1);

    const summary = GameAnalysisSummary.buildGameSummary(line, {}, { [line[0].id]: BLUNDER });

    expect(summary.whiteMarks).toEqual({});
    expect(summary.blackMarks).toEqual({ [MoveMarks.BLUNDER]: 1 });
  });

  it("ignores the start position when the line includes it", function testCase() {
    const line = loadLine("1. e4 e5");

    const summary = GameAnalysisSummary.buildGameSummary(line, {}, { [line[1].id]: BLUNDER });

    expect(summary.totalMoves).toBe(2);
    expect(summary.whiteMarks).toEqual({ [MoveMarks.BLUNDER]: 1 });
    expect(summary.blackMarks).toEqual({});
  });
});
