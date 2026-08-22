import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChessComClient } from "../../lib/ChessComClient.ts";
import { ChessComGamesStorage } from "../../lib/ChessComGamesStorage.ts";
import { ChessComUser } from "../../lib/ChessComUser.ts";
import { AnalysisGame } from "../../lib/AnalysisGame.ts";
import { toGamePlayersInfoFromChessComGame } from "../../lib/gameInfo.ts";
import { ChessReplayImpl } from "../../components/ChessReplay.tsx";

function ChessComGameAnalysisPage() {
  const { userId, gameId } = useParams();

  const {
    data: game,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["chesscom-direct-game", userId, gameId],
    enabled: Boolean(userId && gameId),
    queryFn: async function fetchGame() {
      const loaded = await ChessComClient.getGameById(userId!, gameId!);
      ChessComGamesStorage.save(loaded);
      return loaded;
    },
  });

  if (!userId || !gameId) {
    return <div className="p-6 text-red-600">Missing user ID or game ID</div>;
  }

  if (isLoading) {
    return <div className="p-6 text-gray-500">Loading game...</div>;
  }

  if (error || !game) {
    return <div className="p-6 text-red-600">{error instanceof Error ? error.message : "Game not found"}</div>;
  }

  const pgnWithPlayers = AnalysisGame.withPlayers(game.pgn, toGamePlayersInfoFromChessComGame(game));
  const initialBoardOrientation = ChessComUser.getInitialBoardOrientation(game, userId);

  return <ChessReplayImpl originalPgn={pgnWithPlayers} initialBoardOrientation={initialBoardOrientation} />;
}

export default ChessComGameAnalysisPage;
