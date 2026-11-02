import { describe, expect, it } from "vitest";
import { BotPlayer } from "./BotPlayer.ts";
import type { ChessEngineLine } from "./chess-engine/ChessEngine.ts";

describe("BotPlayer.pickLine", function describePickLine() {
  const lines = ["e2e4", "d2d4", "g1f3"].map(function toLine(uci, index): ChessEngineLine {
    return { uci, pv: [uci], evaluation: 0, depth: 1, multipv: index + 1 };
  });

  it("picks the line selected by the random value according to the weights", function testCase() {
    expect(BotPlayer.pickLine(lines, [6, 3, 1], () => 0).uci).toBe("e2e4");
    expect(BotPlayer.pickLine(lines, [6, 3, 1], () => 0.7).uci).toBe("d2d4");
    expect(BotPlayer.pickLine(lines, [6, 3, 1], () => 0.99).uci).toBe("g1f3");
  });

  it("ignores lines that have no weight", function testCase() {
    expect(BotPlayer.pickLine(lines, [1], () => 0.99).uci).toBe("e2e4");
  });

  it("works when the engine returned fewer lines than weights", function testCase() {
    expect(BotPlayer.pickLine(lines.slice(0, 1), [1, 1, 1], () => 0.99).uci).toBe("e2e4");
  });
});
