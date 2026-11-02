import { Chess, type Color } from "chess.js";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ExtendedChessBoard } from "../../components/ExtendedChessBoard.tsx";
import { BotPlayer } from "../../lib/BotPlayer.ts";
import { getChessEngine } from "../../lib/chess-engine/ChessEngine.ts";
import { ChessComUser } from "../../lib/ChessComUser.ts";
import { chessComGameRepository } from "../../repository/ChessComClientRepository.ts";
import { toGameEntity, toGameId } from "./toGameEntity.ts";

const CLOCK_TICK_MS = 250;
const NO_MOVE_MARKS: Record<string, never> = {};

type MoveInput = { from: string; to: string; promotion?: string };

function toSan(fen: string, move: MoveInput): string | null {
  try {
    return new Chess(fen).move(move).san;
  } catch {
    return null;
  }
}

function formatClock(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function PlayBotPage() {
  const [strength, setStrength] = useState<BotPlayer.Strength>("medium");
  const [session, setSession] = useState<{
    humanColor: Color;
    strength: BotPlayer.Strength;
    startedAt: number;
  } | null>(null);

  function start(humanColor: Color) {
    setSession({ humanColor, strength, startedAt: Date.now() });
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-4">
      <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 flex flex-col gap-4">
        <h2 className="text-2xl font-black text-gray-900">Play with bot</h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-500 mr-2">Bot strength</span>
          {BotPlayer.STRENGTHS.map(function renderStrength(option) {
            return (
              <button
                key={option}
                type="button"
                onClick={() => setStrength(option)}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold capitalize ${
                  option === strength ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => start("w")}
            className="px-4 py-2 rounded-lg bg-gray-800 text-white font-bold hover:bg-black"
          >
            {session ? "New game as White" : "Play as White"}
          </button>
          <button
            type="button"
            onClick={() => start("b")}
            className="px-4 py-2 rounded-lg bg-gray-800 text-white font-bold hover:bg-black"
          >
            {session ? "New game as Black" : "Play as Black"}
          </button>
        </div>
        <p className="text-xs text-gray-500">
          Games are saved to the library of the <b>{ChessComUser.LOCAL_USERNAME}</b> profile.
        </p>
      </div>

      {session && <BotGameBoard key={session.startedAt} {...session} />}
    </div>
  );
}

function BotGameBoard({
  humanColor,
  strength,
  startedAt,
}: {
  humanColor: Color;
  strength: BotPlayer.Strength;
  startedAt: number;
}) {
  const [moves, setMoves] = useState<string[]>([]);
  const [resignedColor, setResignedColor] = useState<Color | null>(null);
  const [elapsedMs, setElapsedMs] = useState<Record<Color, number>>({ w: 0, b: 0 });
  const [error, setError] = useState<string | null>(null);

  const game = useMemo(
    function replayMoves() {
      const chess = new Chess();
      moves.forEach((san) => chess.move(san));
      return chess;
    },
    [moves],
  );
  const fen = game.fen();
  const turn = game.turn();
  const isOver = game.isGameOver() || resignedColor !== null;
  const isHumanTurn = turn === humanColor;
  const botColor: Color = humanColor === "w" ? "b" : "w";

  useEffect(
    function playBotMove() {
      if (isOver || isHumanTurn || error) return;

      let isCancelled = false;
      BotPlayer.chooseMove(getChessEngine(), fen, strength).then(
        function applyBotMove(uci) {
          if (isCancelled) return;
          const promotion = uci.slice(4) || undefined;
          const san = toSan(fen, { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion });
          if (san) setMoves((previous) => [...previous, san]);
          else setError(`Bot chose an illegal move: ${uci}`);
        },
        function reportFailure(failure: unknown) {
          if (!isCancelled) setError(failure instanceof Error ? failure.message : "Bot failed to move");
        },
      );
      return function cancel() {
        isCancelled = true;
      };
    },
    [fen, strength, isOver, isHumanTurn, error],
  );

  useEffect(
    function tickClock() {
      if (isOver) return;

      let lastTickAt = Date.now();
      const intervalId = setInterval(function tick() {
        const now = Date.now();
        const delta = now - lastTickAt;
        lastTickAt = now;
        setElapsedMs((previous) => ({ ...previous, [turn]: previous[turn] + delta }));
      }, CLOCK_TICK_MS);
      return function stopClock() {
        clearInterval(intervalId);
      };
    },
    [isOver, turn],
  );

  useEffect(
    function saveFinishedGame() {
      if (!isOver || moves.length === 0) return;
      chessComGameRepository.save(toGameEntity(moves, humanColor, strength, resignedColor, startedAt, Date.now()));
    },
    [isOver, moves, humanColor, strength, resignedColor, startedAt],
  );

  function makeHumanMove(move: MoveInput) {
    if (isOver || !isHumanTurn) return;
    const san = toSan(fen, move);
    if (san) setMoves((previous) => [...previous, san]);
  }

  function getStatusText(): string {
    if (!isOver) return isHumanTurn ? "Your move" : "Bot is thinking...";
    if (resignedColor) return "You resigned";
    if (game.isCheckmate()) return isHumanTurn ? "Checkmate, the bot wins" : "Checkmate, you win";
    return "Draw";
  }

  return (
    <div className="bg-white p-4 rounded-xl shadow-lg border border-gray-100 flex flex-col gap-2">
      <ClockBar name={BotPlayer.botName(strength)} ms={elapsedMs[botColor]} isRunning={!isOver && turn === botColor} />
      <div className="rounded-md border-8 border-gray-800 bg-gray-800 overflow-hidden">
        <ExtendedChessBoard
          id="PlayBotBoard"
          position={fen}
          boardOrientation={humanColor === "w" ? "white" : "black"}
          animationDuration={300}
          makeMove={makeHumanMove}
          currentPositionGame={game}
          moveMarksBySquare={NO_MOVE_MARKS}
        />
      </div>
      <ClockBar
        name={ChessComUser.LOCAL_USERNAME}
        ms={elapsedMs[humanColor]}
        isRunning={!isOver && turn === humanColor}
      />

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <span className="font-bold text-gray-900">{getStatusText()}</span>
        {error && (
          <span className="text-sm text-red-600">
            {error}{" "}
            <button type="button" onClick={() => setError(null)} className="underline font-bold">
              Retry
            </button>
          </span>
        )}
        {!isOver && moves.length > 0 && (
          <button
            type="button"
            onClick={() => setResignedColor(humanColor)}
            className="ml-auto px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-sm font-bold hover:bg-red-100"
          >
            Resign
          </button>
        )}
        {isOver && moves.length > 0 && (
          <div className="ml-auto flex items-center gap-3 text-sm font-bold">
            <Link
              to={`/analysis/chesscom/user/${ChessComUser.LOCAL_USERNAME}/game/${toGameId(startedAt)}`}
              className="text-indigo-600 hover:underline"
            >
              Analyze game
            </Link>
            <Link to={`/user/${ChessComUser.LOCAL_USERNAME}`} className="text-indigo-600 hover:underline">
              All games
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function ClockBar({ name, ms, isRunning }: { name: string; ms: number; isRunning: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-semibold text-gray-800">{name}</span>
      <span
        className={`font-mono text-lg px-2 rounded ${isRunning ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"}`}
      >
        {formatClock(ms)}
      </span>
    </div>
  );
}

export default PlayBotPage;
