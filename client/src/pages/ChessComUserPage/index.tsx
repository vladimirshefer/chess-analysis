import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useParams } from "react-router-dom";
import LibraryGameCard from "../../components/LibraryGameCard.tsx";
import { ChessComLibraryAnalysis } from "../../lib/ChessComLibraryAnalysis.ts";
import { ChessComUser } from "../../lib/ChessComUser.ts";
import { chessComClientRepository, chessComGameRepository } from "../../repository/ChessComClientRepository.ts";
import { chessComGameAnalysisRepository } from "../../repository/ChessComGameAnalysisRepository.ts";
import { chessComUserRepository } from "../../repository/ChessComUserRepository.ts";

function ChessComUserPage() {
  const { username = "" } = useParams();

  // Fetching recent games also stores them in the games repository.
  const recentGamesQuery = useQuery({
    queryKey: ["chess-com-user-recent-games", username],
    refetchOnWindowFocus: false,
    queryFn: async function fetchRecentGames() {
      const result = await chessComClientRepository.getRecentGames(username, 10);
      chessComUserRepository.save({ username });
      return result;
    },
  });
  const games = useMemo(
    function loadUserGames() {
      return chessComGameRepository.getAll().filter((game) => ChessComUser.isParticipant(game, username));
    },
    [username, recentGamesQuery.dataUpdatedAt],
  );
  const analysesQuery = useQuery({
    queryKey: ChessComLibraryAnalysis.ANALYSIS_QUERY_KEY,
    queryFn: function loadAnalyses() {
      return chessComGameAnalysisRepository.getAll();
    },
    select: ChessComLibraryAnalysis.toEntityByGameId,
    refetchInterval: ChessComLibraryAnalysis.REFETCH_INTERVAL_MS,
  });
  const recentGames = recentGamesQuery.data;
  const analysisById = analysesQuery.data ?? {};

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
      <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-gray-900">{recentGames?.player.username ?? username}</h2>
            <p className="text-sm text-gray-500 mt-1">
              {games.length} stored games
              {recentGamesQuery.isFetching && " · loading fresh games..."}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {recentGames && (
              <a
                href={recentGames.player.url}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-bold text-indigo-600 hover:underline"
              >
                Chess.com profile
              </a>
            )}
            <button
              type="button"
              disabled={recentGamesQuery.isFetching}
              onClick={() => void recentGamesQuery.refetch()}
              className="px-4 py-2 bg-gray-800 text-white text-sm font-bold rounded-lg hover:bg-black disabled:opacity-40"
            >
              {recentGamesQuery.isFetching ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>
        {recentGamesQuery.error && (
          <div className="mt-4 text-sm text-red-600 font-medium">
            {recentGamesQuery.error instanceof Error
              ? recentGamesQuery.error.message
              : "Unable to load Chess.com games"}
          </div>
        )}
      </div>

      <div className="space-y-3">
        {games.length === 0 && !recentGamesQuery.isFetching && (
          <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 text-sm text-gray-500">
            No games found.
          </div>
        )}

        {games.map(function renderGame(game) {
          return (
            <LibraryGameCard key={game.id} game={game} analysis={analysisById[game.id] ?? null} username={username} />
          );
        })}
      </div>
    </div>
  );
}

export default ChessComUserPage;
