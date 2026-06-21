import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChessComGameAnalysisStorage } from "../lib/ChessComGameAnalysisStorage.ts";
import { ChessComGamesStorage } from "../lib/ChessComGamesStorage.ts";
import { ChessComLibraryAnalysis } from "../lib/ChessComLibraryAnalysis.ts";

export default function LibraryAnalysisProgress() {
  const [games, setGames] = useState(() => ChessComLibraryAnalysis.loadLibraryGames());
  const [entities, setEntities] = useState(() => ChessComGameAnalysisStorage.load());

  useEffect(function subscribeToLibrary() {
    return ChessComGamesStorage.subscribe(function handleGamesChange() {
      setGames(ChessComLibraryAnalysis.loadLibraryGames());
    });
  }, []);

  useEffect(function subscribeToAnalysis() {
    return ChessComGameAnalysisStorage.subscribe(function handleAnalysisChange() {
      setEntities(ChessComGameAnalysisStorage.load());
    });
  }, []);

  const progress = useMemo(
    function buildProgress() {
      return ChessComLibraryAnalysis.getGlobalProgress(games, entities);
    },
    [entities, games],
  );

  const runningGame = useMemo(
    function findRunningGame() {
      if (!progress.runningGameId) return null;
      return (
        games.find(function matchGame(game) {
          return game.id === progress.runningGameId;
        }) ?? null
      );
    },
    [games, progress.runningGameId],
  );

  if (progress.totalGames === 0) return null;

  const totalProgress =
    progress.totalPositions > 0
      ? progress.analyzedPositions / progress.totalPositions
      : progress.doneGames / progress.totalGames;

  return (
    <div className="border-t border-gray-100 bg-gray-50/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-1.5">
        <div className="flex items-center justify-between gap-3 text-[11px] text-gray-500">
          <div className="min-w-0 truncate">
            <Link to="/library/chess-com" className="font-semibold text-gray-600 hover:text-indigo-600">
              Library
            </Link>
            <span className="mx-1">·</span>
            <span>
              {progress.doneGames}/{progress.totalGames} games
            </span>
            {progress.totalPositions > 0 && (
              <>
                <span className="mx-1">·</span>
                <span>
                  {progress.analyzedPositions}/{progress.totalPositions} positions
                </span>
              </>
            )}
            {runningGame && (
              <>
                <span className="mx-1">·</span>
                <span className="truncate">
                  {runningGame.white.username} vs {runningGame.black.username}
                </span>
              </>
            )}
          </div>
          <div className="shrink-0">{progress.doneGames === progress.totalGames ? "Ready" : "Analyzing"}</div>
        </div>
        <div className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-indigo-500 transition-all"
            style={{ width: `${Math.max(0, Math.min(100, totalProgress * 100))}%` }}
          />
        </div>
      </div>
    </div>
  );
}
