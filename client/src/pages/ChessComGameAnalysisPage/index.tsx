import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { chessComClientRepository } from "../../repository/ChessComClientRepository.ts";
import { ChessComUser } from "../../lib/ChessComUser.ts";
import { AnalysisGame } from "../../lib/AnalysisGame.ts";
import { toGamePlayersInfoFromChessComGame } from "../../lib/gameInfo.ts";
import { ChessReplayImpl } from "../../components/ChessReplay.tsx";

function ChessComGameAnalysisPage() {
  const { userId, gameId } = useParams();

  const gameQuery = useQuery({
    queryKey: ["chesscom-direct-game", userId, gameId],
    enabled: Boolean(userId && gameId),
    queryFn: async function fetchGame() {
      return chessComClientRepository.getGameById(userId!, gameId!);
    },
  });

  const game = gameQuery.data;

  if (!userId || !gameId) {
    return <div className="p-6 text-red-600">Missing user ID or game ID</div>;
  }

  if (gameQuery.isLoading) {
    return <div className="p-6 text-gray-500">Loading game...</div>;
  }

  if (gameQuery.error || !game) {
    return (
      <div className="p-6 text-red-600">
        {gameQuery.error instanceof Error ? gameQuery.error.message : "Game not found"}
      </div>
    );
  }

  const pgnWithPlayers = AnalysisGame.withPlayers(game.pgn, toGamePlayersInfoFromChessComGame(game));
  const initialBoardOrientation = ChessComUser.getInitialBoardOrientation(game, userId);

  return (
    <ChessReplayImpl
      originalPgn={pgnWithPlayers}
      initialBoardOrientation={initialBoardOrientation}
      shareUrl={window.location.href}
    />
  );
}

export default ChessComGameAnalysisPage;
