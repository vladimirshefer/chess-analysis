import { describe, expect, it } from "vitest";
import { Evaluations, GameResult, type EngineEvaluation } from "./evaluation";

describe("Evaluations.absoluteNumericEvaluationOfMate", function suite() {
  it("encodes positive and negative mate scores", function testCase() {
    expect(Evaluations.absoluteNumericEvaluationOfMate(5)).toBe(1_999_994);
    expect(Evaluations.absoluteNumericEvaluationOfMate(-5)).toBe(-1_999_994);
  });

  it("clamps distance to supported range", function testCase() {
    expect(Evaluations.absoluteNumericEvaluationOfMate(2_000_000)).toBe(1_000_000);
    expect(Evaluations.absoluteNumericEvaluationOfMate(-2_000_000)).toBe(-1_000_000);
  });

  it("throws for mate in 0", function testCase() {
    expect(function callWithZero() {
      Evaluations.absoluteNumericEvaluationOfMate(0);
    }).toThrow("mateInMoves cannot be 0");
  });
});

describe("Evaluations.absoluteNumericEvaluationOfCentipawns", function suite() {
  it("truncates and clamps centipawn values", function testCase() {
    expect(Evaluations.absoluteNumericEvaluationOfCentipawns(12.9)).toBe(12);
    expect(Evaluations.absoluteNumericEvaluationOfCentipawns(600_000)).toBe(500_000);
    expect(Evaluations.absoluteNumericEvaluationOfCentipawns(-600_000)).toBe(-500_000);
  });
});

describe("Evaluations.absoluteNumericEvaluationOfWhiteWin", function suite() {
  it("returns terminal white win score", function testCase() {
    expect(Evaluations.absoluteNumericEvaluationOfWhiteWin()).toBe(2_000_000);
  });
});

describe("Evaluations.absoluteNumericEvaluationOfEngineEvaluation", function suite() {
  it("encodes cp, mate and result evaluations", function testCase() {
    const cpEval: EngineEvaluation = { kind: "cp", pawns: 0.35 };
    const mateEval: EngineEvaluation = { kind: "mate", moves: 5 };
    const whiteWinEval: EngineEvaluation = { kind: "result", result: GameResult.WHITE_WIN };
    const blackWinEval: EngineEvaluation = { kind: "result", result: GameResult.BLACK_WIN };
    const drawEval: EngineEvaluation = { kind: "result", result: GameResult.DRAW };

    expect(Evaluations.absoluteNumericEvaluationOfEngineEvaluation(cpEval)).toBe(35);
    expect(Evaluations.absoluteNumericEvaluationOfEngineEvaluation(mateEval)).toBe(1_999_994);
    expect(Evaluations.absoluteNumericEvaluationOfEngineEvaluation(whiteWinEval)).toBe(2_000_000);
    expect(Evaluations.absoluteNumericEvaluationOfEngineEvaluation(blackWinEval)).toBe(-2_000_000);
    expect(Evaluations.absoluteNumericEvaluationOfEngineEvaluation(drawEval)).toBe(0);
  });
});

describe("Evaluations.toString", function suite() {
  it("formats terminal and centipawn values", function testCase() {
    expect(Evaluations.toString(2_000_000)).toBe(GameResult.WHITE_WIN);
    expect(Evaluations.toString(-2_000_000)).toBe(GameResult.BLACK_WIN);
    expect(Evaluations.toString(35)).toBe("+0.3");
    expect(Evaluations.toString(-120)).toBe("-1.2");
  });

  it("formats mate values", function testCase() {
    expect(Evaluations.toString(1_999_994)).toBe("+M5");
    expect(Evaluations.toString(-1_999_994)).toBe("-M5");
  });
});
