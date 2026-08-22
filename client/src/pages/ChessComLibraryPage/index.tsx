import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ValuesHistogram from "../../components/ValuesHistogram.tsx";
import { ChessComClient } from "../../lib/ChessComClient.ts";
import { ChessComGameAnalysisStorage } from "../../lib/ChessComGameAnalysisStorage.ts";
import { ChessComGamesStorage } from "../../lib/ChessComGamesStorage.ts";
import { ChessComLibraryAnalysis } from "../../lib/ChessComLibraryAnalysis.ts";
import { ChessComUser } from "../../lib/ChessComUser.ts";

function ChessComLibraryPage() {
  const [games, setGames] = useState(() => ChessComLibraryAnalysis.loadLibraryGames());
  const [analysisById, setAnalysisById] = useState(() => toEntityByGameId(ChessComGameAnalysisStorage.load()));

  useEffect(function subscribeToLibraryGames() {
    return ChessComGamesStorage.subscribe(function handleGamesChange() {
      setGames(ChessComLibraryAnalysis.loadLibraryGames());
    });
  }, []);

  useEffect(function subscribeToLibraryAnalysis() {
    return ChessComGameAnalysisStorage.subscribe(function handleAnalysisChange() {
      setAnalysisById(toEntityByGameId(ChessComGameAnalysisStorage.load()));
    });
  }, []);

  const progress = useMemo(
    function buildProgress() {
      return ChessComLibraryAnalysis.getGlobalProgress(games, Object.values(analysisById));
    },
    [analysisById, games],
  );

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
      <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <h2 className="text-2xl font-black text-gray-900">Chess.com Library</h2>
            <p className="text-sm text-gray-500 mt-1">Stored games with depth-12 background analysis.</p>
          </div>
          <Link to="/import/chess-com" className="text-sm font-bold text-indigo-600 hover:underline">
            Import games
          </Link>
        </div>

        <div className="text-sm text-gray-600">
          {progress.doneGames}/{progress.totalGames} games complete
          {progress.totalPositions > 0 && ` · ${progress.analyzedPositions}/${progress.totalPositions} positions`}
        </div>
      </div>

      <div className="space-y-3">
        {games.length === 0 && (
          <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 text-sm text-gray-500">
            No stored games yet.
          </div>
        )}

        {games.map(function renderGame(game) {
          return <LibraryGameCard key={game.id} game={game} analysis={analysisById[game.id] ?? null} />;
        })}
      </div>
    </div>
  );
}

function LibraryGameCard({
  game,
  analysis,
}: {
  game: ChessComClient.Dto.ChessComGameSummary;
  analysis: ChessComGameAnalysisStorage.ChessComGameAnalysisEntity | null;
}) {
  const progress = analysis?.totalPositions ? analysis.analyzedPositions / analysis.totalPositions : 0;

  return (
    <Link
      to={ChessComUser.toGameAnalysisUrl(game)}
      className="block bg-white p-4 rounded-xl shadow-lg border border-gray-100 hover:border-indigo-200 transition-colors"
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bold text-gray-900 truncate">
              {game.white.username} vs {game.black.username}
            </div>
            <div className="text-xs text-gray-500">
              {formatTimestamp(game.endTime)} · {game.timeClass} · {game.timeControl}
            </div>
          </div>
          <div className="text-xs font-medium text-gray-500">{toStatusLabel(analysis)}</div>
        </div>

        {analysis && analysis.totalPositions > 0 && (
          <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all"
              style={{ width: `${Math.max(0, Math.min(100, progress * 100))}%` }}
            />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_180px] gap-4 items-center">
          <div className="grid grid-cols-2 gap-3">
            <PlayerSummary side="White" player={game.white} accuracy={analysis?.whiteAccuracy ?? null} />
            <PlayerSummary side="Black" player={game.black} accuracy={analysis?.blackAccuracy ?? null} />
          </div>

          <div className="rounded-md overflow-hidden border border-gray-200 bg-white">
            <ValuesHistogram
              values={analysis?.histogramValues ?? []}
              secondaryValues={analysis?.materialValues ?? []}
            />
          </div>
        </div>
      </div>
    </Link>
  );
}

function PlayerSummary({
  side,
  player,
  accuracy,
}: {
  side: string;
  player: ChessComClient.Dto.ChessComGamePlayer;
  accuracy: number | null;
}) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
      <div className="font-semibold text-gray-800">{side}</div>
      <div className="text-sm text-gray-600">
        {player.username}
        {typeof player.rating === "number" ? ` (${player.rating})` : ""}
      </div>
      <div className="text-xs text-gray-400">Result: {player.result ?? "-"}</div>
      <div className="text-xs text-gray-400">Accuracy: {formatAccuracy(accuracy)}</div>
    </div>
  );
}

function toEntityByGameId(
  entities: ChessComGameAnalysisStorage.ChessComGameAnalysisEntity[],
): Record<string, ChessComGameAnalysisStorage.ChessComGameAnalysisEntity> {
  return entities.reduce(
    function collectById(result, entity) {
      result[entity.gameId] = entity;
      return result;
    },
    {} as Record<string, ChessComGameAnalysisStorage.ChessComGameAnalysisEntity>,
  );
}

function toStatusLabel(analysis: ChessComGameAnalysisStorage.ChessComGameAnalysisEntity | null): string {
  if (!analysis) return "Pending";
  if (analysis.status === "done") return "Ready";
  if (analysis.status === "running") return `Analyzing ${analysis.analyzedPositions}/${analysis.totalPositions}`;
  if (analysis.status === "failed") return analysis.errorMessage ? `Failed: ${analysis.errorMessage}` : "Failed";
  return `Pending ${analysis.analyzedPositions}/${analysis.totalPositions}`;
}

function formatTimestamp(timestamp: number | null): string {
  if (!timestamp) return "Unknown date";
  return new Date(timestamp * 1000).toLocaleString();
}

function formatAccuracy(accuracy: number | null): string {
  if (typeof accuracy !== "number") return "-";
  return `${accuracy.toFixed(1)}%`;
}

export default ChessComLibraryPage;
