import { describe, expect, it } from "vitest";
import { RoutePattern } from "./RoutePattern.ts";

describe("RoutePattern.fromPath", function describeFromPath() {
  it("returns the path unchanged when there are no params", function testCase() {
    expect(RoutePattern.fromPath("/about", {})).toBe("/about");
    expect(RoutePattern.fromPath("/", {})).toBe("/");
  });

  it("replaces param values with param names", function testCase() {
    expect(
      RoutePattern.fromPath("/analysis/chesscom/user/vshefer/game/186269712682", {
        userId: "vshefer",
        gameId: "186269712682",
      }),
    ).toBe("/analysis/chesscom/user/:userId/game/:gameId");
  });

  it("replaces only whole segments", function testCase() {
    expect(RoutePattern.fromPath("/user/chess", { username: "chess" })).toBe("/user/:username");
    expect(RoutePattern.fromPath("/analysis/chesscom/user/ches", { userId: "ches" })).toBe(
      "/analysis/chesscom/user/:userId",
    );
  });

  it("matches encoded param values", function testCase() {
    expect(RoutePattern.fromPath("/user/a%20b", { username: "a b" })).toBe("/user/:username");
  });
});
