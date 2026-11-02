import { describe, expect, it } from "vitest";
import { toGameEntity, toGameId } from "./toGameEntity.ts";

describe("toGameEntity", function describeToGameEntity() {
  const startedAt = Date.UTC(2026, 10, 2, 12, 0, 0);

  it("stores a human checkmate win under the local profile", function testCase() {
    const moves = ["f3", "e5", "g4", "Qh4#"];
    const entity = toGameEntity(moves, "b", "weak", null, startedAt, startedAt + 5000);

    expect(entity.id).toBe(toGameId(startedAt));
    expect(entity.black).toEqual({ username: "local", result: "win" });
    expect(entity.white).toEqual({ username: "Bot (weak)", result: "checkmated" });
    expect(entity.endTime).toBe(Math.floor((startedAt + 5000) / 1000));
    expect(entity.pgn).toContain('[White "Bot (weak)"]');
    expect(entity.pgn).toContain('[Result "0-1"]');
    expect(entity.pgn).toContain("Qh4#");
  });

  it("gives the win to the opponent of the side that resigned", function testCase() {
    const entity = toGameEntity(["e4", "e5"], "w", "strong", "w", startedAt, startedAt + 1000);

    expect(entity.white).toEqual({ username: "local", result: "resigned" });
    expect(entity.black).toEqual({ username: "Bot (strong)", result: "win" });
    expect(entity.pgn).toContain('[Result "0-1"]');
  });

  it("records a stalemate as a draw for both sides", function testCase() {
    const moves = "e3 a5 Qh5 Ra6 Qxa5 h5 h4 Rah6 Qxc7 f6 Qxd7+ Kf7 Qxb7 Qd3 Qxb8 Qh7 Qxc8 Kg6 Qe6".split(" ");
    const entity = toGameEntity(moves, "w", "medium", null, startedAt, startedAt + 1000);

    expect(entity.white.result).toBe("stalemate");
    expect(entity.black.result).toBe("stalemate");
    expect(entity.pgn).toContain('[Result "1/2-1/2"]');
  });
});
