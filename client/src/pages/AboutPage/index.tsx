import { useCallback } from "react";
import { chessComGameRepository } from "../../repository/ChessComClientRepository.ts";
import { chessComGameAnalysisRepository } from "../../repository/ChessComGameAnalysisRepository.ts";
import { chessComUserRepository } from "../../repository/ChessComUserRepository.ts";
import { positionEvaluationsRepository } from "../../repository/PositionEvaluationRepository.ts";

export function AboutPage() {
  const clearAllData = useCallback(async function clearAllData(): Promise<void> {
    if (!window.confirm("Your history, profiles, analysis will be removed. Continue?")) return;
    try {
      await chessComGameRepository.deleteAll();
      await chessComGameAnalysisRepository.deleteAll();
      chessComUserRepository.delete();
      await positionEvaluationsRepository.deleteAll();
      window.location.reload();
    } catch (error) {
      console.error("Failed to clear data", error);
    }
  }, []);
  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg border border-gray-100">
        <h2 className="text-3xl font-bold mb-4 text-gray-900">Chess analysis. Simple, quick, free.</h2>
        <p className="text-gray-600 mb-6">
          Free, opensource visual analysis of your chess games. See what you did and what you could do. Learn ideas and
          plans without long reads.
        </p>
        <ul className="list-disc pl-5 space-y-2 text-gray-700">
          <li>Quick visual board cues, not long reading.</li>
          <li>Classic engine analysis is available whenever you want it.</li>
          <li>Coming soon: your game library, statistics, and opening repertoire analysis.</li>
        </ul>
        <div className="mt-8 pt-6 border-t border-gray-100">
          <button
            type="button"
            onClick={() => void clearAllData()}
            className="px-3 py-1.5 border border-red-300 text-red-700 text-sm font-bold rounded-lg hover:bg-red-50"
          >
            Clear all data
          </button>
        </div>
      </div>
    </div>
  );
}
