export namespace ForsythEdwardsNotation {
  /**
   * Returns "w" for white to move or "b" for black to move.
   */
  export function getSideToMove(fen: string): "w" | "b" {
    return fen.split(" ")[1] as "w" | "b";
  }
}
