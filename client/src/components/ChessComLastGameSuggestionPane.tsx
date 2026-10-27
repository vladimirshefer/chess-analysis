import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { FaFileImport } from "react-icons/fa6";
import { Link } from "react-router-dom";
import { chessComClientRepository } from "../repository/ChessComClientRepository.ts";
import { chessComUserRepository } from "../repository/ChessComUserRepository.ts";
import { chessComGameRepository } from "../repository/ChessComGamesRepository.ts";
import { ChessComUser } from "../lib/ChessComUser.ts";
import RenderIcon from "./RenderIcon.tsx";

function ChessComLastGameSuggestionPane() {
  const storedChessComUsername = useMemo(function loadStoredUsername() {
    return chessComUserRepository.get()?.username ?? null;
  }, []);

  const { data: suggestedChessComGame, isLoading } = useQuery({
    queryKey: ["chess-com-last-game-suggestion", storedChessComUsername],
    enabled: Boolean(storedChessComUsername),
    initialData: function getInitialSuggestion() {
      if (!storedChessComUsername) return null;
      return ChessComUser.findLatestGame(chessComGameRepository.getAll(), storedChessComUsername);
    },
    queryFn: async function fetchLatestGame() {
      const result = await chessComClientRepository.getRecentGames(storedChessComUsername!, 1);
      const lastGame = result.games[0] ?? null;
      if (lastGame) {
        try {
          chessComGameRepository.save(lastGame);
        } catch (error) {
          console.error("Failed to cache last Chess.com game", error);
        }
      }
      return lastGame;
    },
  });

  if (!storedChessComUsername) {
    return (
      <div className="px-3 py-2 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs">Import from Chess.com</span>
          <Link
            to="/import/chess-com"
            className="ml-auto inline-flex items-center justify-center gap-1.5 border bg-black px-2 py-1 text-xs text-white hover:bg-gray-800"
          >
            <RenderIcon iconType={FaFileImport} className="text-xs" />
            <span>Import</span>
          </Link>
        </div>
      </div>
    );
  }
  if (!suggestedChessComGame && !isLoading) return null;

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
        <Link to="/import/chess-com" className="text-xs hover:underline">
          More
        </Link>
      </div>
    </div>
  );
}

export default ChessComLastGameSuggestionPane;
