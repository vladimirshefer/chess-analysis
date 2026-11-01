import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { chessComClientRepository } from "../../repository/ChessComClientRepository.ts";
import { ChessComUser } from "../../lib/ChessComUser.ts";
import { AnalysisGame } from "../../lib/AnalysisGame.ts";
import { toGamePlayersInfoFromChessComGame } from "../../lib/gameInfo.ts";
import { ChessReplayImpl } from "../../components/ChessReplay.tsx";

function ChessComUserAnalysisPage() {
  const { userId } = useParams();
  const [searchParams] = useSearchParams();
  const opponent = searchParams.get("opponent");
  const date = searchParams.get("date");

  const gameQuery = useQuery({
    queryKey: ["chesscom-user-game", userId, opponent, date],
    enabled: Boolean(userId && opponent && date),
    queryFn: async function fetchGame() {
      return chessComClientRepository.findGameByOpponentAndDate(userId!, opponent!, date!);
    },
  });

  const game = gameQuery.data;

  if (!userId) {
    return <div className="p-6 text-red-600">Missing user ID</div>;
  }

  if (!opponent || !date) {
    return <div className="p-6 text-red-600">Missing required query parameters: opponent and date</div>;
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

export default ChessComUserAnalysisPage;
