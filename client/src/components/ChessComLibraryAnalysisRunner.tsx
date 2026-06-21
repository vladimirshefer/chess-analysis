import { useEffect } from "react";
import { getChessEngine } from "../lib/ChessEngine.ts";
import { ChessComLibraryAnalysis } from "../lib/ChessComLibraryAnalysis.ts";

let activeRunId = 0;

export default function ChessComLibraryAnalysisRunner() {
  useEffect(function startBackgroundRunner() {
    activeRunId += 1;
    const runId = activeRunId;
    let isCancelled = false;

    async function loop(): Promise<void> {
      const engine = getChessEngine();

      while (!isCancelled && activeRunId === runId) {
        try {
          const didWork = await ChessComLibraryAnalysis.processNextStep(engine);
          await wait(didWork ? 100 : 1500);
        } catch (error) {
          console.error("Library background analysis failed", error);
          await wait(1500);
        }
      }
    }

    void loop();

    return function cleanup() {
      isCancelled = true;
      if (activeRunId === runId) activeRunId += 1;
    };
  }, []);

  return null;
}

async function wait(durationMs: number): Promise<void> {
  await new Promise(function resolveAfterDelay(resolve) {
    window.setTimeout(resolve, durationMs);
  });
}
