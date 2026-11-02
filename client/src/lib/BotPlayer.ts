import { type ChessEngine, type ChessEngineLine, EngineEvaluationPriorities } from "./chess-engine/ChessEngine.ts";

export namespace BotPlayer {
  export type Strength = "weak" | "medium" | "strong";

  export const STRENGTHS: Strength[] = ["weak", "medium", "strong"];

  export function botName(strength: Strength): string {
    return `Bot (${strength})`;
  }

  /** The engine searches `depth` plies and the bot picks one of the best `weights.length` lines, by weight. */
  const PROFILES: Record<Strength, { depth: number; weights: number[] }> = {
    weak: { depth: 1, weights: [1, 1, 1, 1, 1, 1] },
    medium: { depth: 6, weights: [6, 3, 1] },
    strong: { depth: 14, weights: [1] },
  };

  export function pickLine(
    lines: ChessEngineLine[],
    weights: number[],
    random: () => number = Math.random,
  ): ChessEngineLine {
    const candidates = lines.slice(0, weights.length);
    const total = candidates.reduce(function sum(result, _line, index) {
      return result + weights[index];
    }, 0);

    let threshold = random() * total;
    for (let index = 0; index < candidates.length; index += 1) {
      threshold -= weights[index];
      if (threshold < 0) return candidates[index];
    }
    return candidates[candidates.length - 1];
  }

  /** Returns the chosen move in UCI notation, e.g. `e2e4` or `e7e8q`. */
  export async function chooseMove(engine: ChessEngine, fen: string, strength: Strength): Promise<string> {
    const { depth, weights } = PROFILES[strength];
    const evaluation = await engine.evaluate(
      fen,
      { minDepth: depth, linesAmount: weights.length },
      EngineEvaluationPriorities.IMMEDIATE,
    );
    if (evaluation.lines.length === 0) throw new Error("Engine returned no moves");
    return pickLine(evaluation.lines, weights).uci;
  }
}
