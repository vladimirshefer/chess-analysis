import { useQuery } from "@tanstack/react-query";
import { FaFileImport } from "react-icons/fa6";
import { Link } from "react-router-dom";
import { chessComClientRepository } from "../repository/ChessComClientRepository.ts";
import { ChessComLibraryAnalysis } from "../lib/ChessComLibraryAnalysis.ts";
import { ChessComUser } from "../lib/ChessComUser.ts";
import { chessComUserRepository } from "../repository/ChessComUserRepository.ts";
import RenderIcon from "./RenderIcon.tsx";

function ChessComLastGameSuggestionPane() {
  const currentUserQuery = useQuery({
    queryKey: ChessComLibraryAnalysis.CURRENT_USER_QUERY_KEY,
    queryFn: function loadCurrentUser() {
      return chessComUserRepository.get();
    },
  });
  const storedChessComUsername = currentUserQuery.data?.username ?? null;

  const suggestedGameQuery = useQuery({
    queryKey: ["chess-com-last-game-suggestion", storedChessComUsername],
    enabled: Boolean(storedChessComUsername),
    queryFn: async function fetchLatestGame() {
      const result = await chessComClientRepository.getRecentGames(storedChessComUsername!, 1);
      return result.games[0] ?? null;
    },
  });

  const suggestedChessComGame = suggestedGameQuery.data;

  if (currentUserQuery.isPending) return null;
  if (!storedChessComUsername) {
    return (
      <div className="px-3 py-2 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs">Add your Chess.com profile from the menu at the top right</span>
        </div>
      </div>
    );
  }
  if (!suggestedChessComGame && !suggestedGameQuery.isLoading) return null;

  return (
    <div className="px-3 py-2 shadow">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs">Recent game</span>
        {suggestedChessComGame ? (
          <>
            <span className="min-w-0 truncate text-sm font-semibold">
              {suggestedChessComGame.white.username} vs {suggestedChessComGame.black.username}
            </span>
            <Link
              to={ChessComUser.toGameAnalysisUrl(suggestedChessComGame, storedChessComUsername)}
              className="ml-auto inline-flex items-center justify-center gap-1.5 border bg-black px-2 py-1 text-xs text-white hover:bg-gray-800"
            >
              <RenderIcon iconType={FaFileImport} className="text-xs" />
              <span>Open</span>
            </Link>
          </>
        ) : (
          <span className="text-xs text-gray-500">Checking latest game...</span>
        )}
        <Link to={`/user/${encodeURIComponent(storedChessComUsername)}`} className="text-xs hover:underline">
          More
        </Link>
      </div>
    </div>
  );
}

export default ChessComLastGameSuggestionPane;
