import { Link } from "react-router-dom";
import MoveMarksSummary from "./MoveMarksSummary.tsx";
import ValuesHistogram from "./ValuesHistogram.tsx";
import type { ChessComClient } from "../lib/ChessComClient.ts";
import { ChessComUser } from "../lib/ChessComUser.ts";
import type { ChessComGameAnalysisEntity } from "../repository/ChessComGameAnalysisRepository.ts";
import type { ChessComGameEntity } from "../repository/ChessComClientRepository.ts";

export default function LibraryGameCard({
  game,
  analysis,
  username,
}: {
  game: ChessComGameEntity;
  analysis: ChessComGameAnalysisEntity | null;
  username: string | null;
}) {
  const progress = analysis?.totalPositions ? analysis.analyzedPositions / analysis.totalPositions : 0;
  const myColor = ChessComUser.getInitialBoardOrientation(game, username);
  const white = {
    color: "white",
    player: game.white,
    accuracy: analysis?.whiteAccuracy ?? null,
    marks: analysis?.whiteMarks ?? {},
  };
  const black = {
    color: "black",
    player: game.black,
    accuracy: analysis?.blackAccuracy ?? null,
    marks: analysis?.blackMarks ?? {},
  };
  const [me, opponent] = myColor === "white" ? [white, black] : [black, white];
  const statusLabel = toStatusLabel(analysis);

  return (
    <Link
      to={ChessComUser.toGameAnalysisUrl(game, username)}
      className="block bg-white p-4 rounded-xl shadow-lg border border-gray-100 hover:border-indigo-200 transition-colors"
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bold text-gray-900 truncate">
              {me.player.username} vs {opponent.player.username}
            </div>
            <div className="text-xs text-gray-500">
              {formatTimestamp(game.endTime)} · {game.timeClass}
              {game.timeControl && game.timeControl !== "-" ? ` · ${game.timeControl}` : ""}
            </div>
          </div>
          {statusLabel && <div className="text-xs font-medium text-gray-500">{statusLabel}</div>}
        </div>

        {analysis && analysis.status !== "done" && analysis.totalPositions > 0 && (
          <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all"
              style={{ width: `${Math.max(0, Math.min(100, progress * 100))}%` }}
            />
          </div>
        )}

        <div className="rounded-md overflow-hidden border border-gray-200 bg-white">
          <ValuesHistogram
            className={myColor === "white" ? "" : "scale-y-[-1]"}
            values={analysis?.histogramValues ?? []}
            secondaryValues={analysis?.materialValues ?? []}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <PlayerSummary {...me} />
          <PlayerSummary {...opponent} />
        </div>
      </div>
    </Link>
  );
}

function PlayerSummary({
  color,
  player,
  accuracy,
  marks,
}: {
  color: string;
  player: ChessComClient.Dto.ChessComGamePlayer;
  accuracy: number | null;
  marks: Record<string, number>;
}) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-sm text-gray-800 min-w-0">
        <span
          className={`w-3 h-3 shrink-0 rounded-sm border border-gray-400 ${color === "white" ? "bg-white" : "bg-black"}`}
        />
        <span className="font-semibold truncate">{player.username}</span>
        {typeof player.rating === "number" && <span className="text-gray-500">({player.rating})</span>}
      </div>
      <div className="flex items-baseline gap-2 text-xs text-gray-500">
        <span className={player.result === "win" ? "font-semibold text-green-600" : ""}>{player.result ?? "-"}</span>
        <span className="text-lg font-semibold text-gray-900">{formatAccuracy(accuracy)}</span>
      </div>
      <MoveMarksSummary marks={marks} className="justify-start text-sm" />
    </div>
  );
}

function toStatusLabel(analysis: ChessComGameAnalysisEntity | null): string {
  if (!analysis) return "Pending";
  if (analysis.status === "done") return "";
  if (analysis.status === "running") return `Analyzing ${analysis.analyzedPositions}/${analysis.totalPositions}`;
  if (analysis.status === "failed") return analysis.errorMessage ? `Failed: ${analysis.errorMessage}` : "Failed";
  return `Pending ${analysis.analyzedPositions}/${analysis.totalPositions}`;
}

function formatTimestamp(timestamp: number | null): string {
  if (!timestamp) return "Unknown date";
  return new Date(timestamp * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function formatAccuracy(accuracy: number | null): string {
  if (typeof accuracy !== "number") return "-";
  return `${Math.round(accuracy)}%`;
}
