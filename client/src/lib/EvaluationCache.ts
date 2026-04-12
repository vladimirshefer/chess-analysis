import type { EngineEvaluation } from "./evaluation.ts";
import type { ChessEngineLine, FullMoveEvaluation } from "./ChessEngine.ts";

export interface EvaluationCache {
  getEvaluation(fen: string, minDepth?: number): FullMoveEvaluation | null;
  addEvaluation(fen: string, depth: number, evaluation: EngineEvaluation, lines: ChessEngineLine[]): void;
}

class FinalEvaluationCache implements EvaluationCache {
  private snapshotsByFen = new Map<string, FullMoveEvaluation[]>();

  getEvaluation(fen: string, minDepth: number = 0): FullMoveEvaluation | null {
    const snapshots = this.snapshotsByFen.get(fen) ?? [];
    return (
      snapshots.find(function findSnapshot(snapshot) {
        return snapshot.depth >= minDepth;
      }) ?? null
    );
  }

  addEvaluation(fen: string, depth: number, evaluation: EngineEvaluation, lines: ChessEngineLine[]): void {
    const nextSnapshot: FullMoveEvaluation = {
      fen,
      depth,
      evaluation,
      lines,
    };
    const snapshots = [...(this.snapshotsByFen.get(fen) ?? [])];
    const existingIndex = snapshots.findIndex(function findByDepth(snapshot) {
      return snapshot.depth === depth;
    });

    if (existingIndex >= 0) {
      snapshots[existingIndex] = mergeEvaluations(snapshots[existingIndex], nextSnapshot);
    } else {
      snapshots.push(nextSnapshot);
    }

    snapshots.sort(function sortByDepth(left, right) {
      return left.depth - right.depth;
    });
    this.snapshotsByFen.set(fen, snapshots);
  }
}

function mergeEvaluations(current: FullMoveEvaluation, next: FullMoveEvaluation): FullMoveEvaluation {
  const mergedByMultiPv = new Map<number, ChessEngineLine>();

  current.lines.forEach((line) => mergedByMultiPv.set(line.multipv, line));
  next.lines.forEach((line) => mergedByMultiPv.set(line.multipv, line));

  return {
    fen: next.fen,
    depth: Math.max(current.depth, next.depth),
    evaluation: next.evaluation,
    lines: [...mergedByMultiPv.values()].sort((left, right) => left.multipv - right.multipv),
  };
}

export function createEvaluationCache(): EvaluationCache {
  return new FinalEvaluationCache();
}

export const sharedEvaluationCache = createEvaluationCache();
