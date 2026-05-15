import { describe, expect, it } from "vitest";
import { Evaluations, GameResult, MATE_BASE, MAX_CENTIPAWN, TERMINAL_RESULT_SCORE } from "./evaluation";

describe("Evaluations.absoluteNumericEvaluationOfMate", function suite() {
  it("encodes positive and negative mate scores", function testCase() {
    expect(Evaluations.absoluteNumericEvaluationOfMate(5)).toBe(1_999_994);
    expect(Evaluations.absoluteNumericEvaluationOfMate(-5)).toBe(-1_999_994);
  });

  it("clamps distance to supported range", function testCase() {
    expect(Evaluations.absoluteNumericEvaluationOfMate(TERMINAL_RESULT_SCORE)).toBe(MATE_BASE);
    expect(Evaluations.absoluteNumericEvaluationOfMate(-TERMINAL_RESULT_SCORE)).toBe(-MATE_BASE);
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
    expect(Evaluations.absoluteNumericEvaluationOfCentipawns(MAX_CENTIPAWN + 100_000)).toBe(MAX_CENTIPAWN);
    expect(Evaluations.absoluteNumericEvaluationOfCentipawns(-MAX_CENTIPAWN - 100_000)).toBe(-MAX_CENTIPAWN);
  });
});

describe("Evaluations.absoluteNumericEvaluationOfWhiteWin", function suite() {
  it("returns terminal white win score", function testCase() {
    expect(Evaluations.absoluteNumericEvaluationOfWhiteWin()).toBe(TERMINAL_RESULT_SCORE);
  });
});

describe("Evaluations.toString", function suite() {
  it("formats terminal and centipawn values", function testCase() {
    expect(Evaluations.toString(TERMINAL_RESULT_SCORE)).toBe(GameResult.WHITE_WIN);
    expect(Evaluations.toString(-TERMINAL_RESULT_SCORE)).toBe(GameResult.BLACK_WIN);
    expect(Evaluations.toString(35)).toBe("+0.3");
    expect(Evaluations.toString(-120)).toBe("-1.2");
  });

  it("formats mate values", function testCase() {
    expect(Evaluations.toString(TERMINAL_RESULT_SCORE - 6)).toBe("+M5");
    expect(Evaluations.toString(-(TERMINAL_RESULT_SCORE - 6))).toBe("-M5");
  });
});
