import { Link, useNavigate } from "react-router-dom";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ChessComClient } from "../../lib/ChessComClient.ts";
import { toImportedGameInfoFromChessComGame } from "../../lib/gameInfo.ts";
import RenderIcon from "../../components/RenderIcon.tsx";
import { FaArrowRight, FaMagnifyingGlass } from "react-icons/fa6";

function ChessComImportPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [gamesResult, setGamesResult] = useState<ChessComClient.Dto.ChessComRecentGames | null>(null);
  const didAutoLoadRef = useRef(false);

  const helperText = useMemo(function buildHelperText() {
    if (import.meta.env.DEV) return "Local mode: direct requests to Chess.com API";
    return "Production mode: requests go through app proxy";
  }, []);

  useEffect(function loadStoredUsername() {
    const storedUsername = window.localStorage.getItem(CHESS_COM_USERNAME_STORAGE_KEY);
    if (!storedUsername) return;
    setUsername(storedUsername);
    if (didAutoLoadRef.current) return;
    didAutoLoadRef.current = true;
    void loadGames(storedUsername);
  }, []);

  async function loadGames(nextUsername: string) {
    if (!nextUsername) {
      setErrorText("Enter a Chess.com username");
      setGamesResult(null);
      return;
    }

    setIsLoading(true);
    setErrorText("");
    window.localStorage.setItem(CHESS_COM_USERNAME_STORAGE_KEY, nextUsername);

    try {
      const result = await ChessComClient.getRecentGames(nextUsername, 10);
      setGamesResult(result);
    } catch (error) {
      setGamesResult(null);
      setErrorText(error instanceof Error ? error.message : "Unable to load Chess.com games");
    } finally {
      setIsLoading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadGames(username.trim());
  }

  function openGame(game: ChessComClient.Dto.ChessComGameSummary) {
    const storedUsername = window.localStorage.getItem(CHESS_COM_USERNAME_STORAGE_KEY);
    const initialBoardOrientation = getInitialBoardOrientation(game, storedUsername);

    navigate("/", {
      state: {
        importedPgn: game.pgn,
        importedGameInfo: toImportedGameInfoFromChessComGame(game),
        initialBoardOrientation,
      },
    });
  }

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-6">
      <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-2xl font-black text-gray-900">Chess.com Import</h2>
            <p className="text-sm text-gray-500 mt-1">Load the latest public games by username.</p>
          </div>
          <Link to="/" className="text-sm font-bold text-indigo-600 hover:underline">
            Back to analyzer
          </Link>
        </div>

        <form onSubmit={submit} className="flex flex-col sm:flex-row gap-3">
          <input
            value={username}
            onChange={function updateUsername(event) {
              setUsername(event.target.value);
            }}
            placeholder="Chess.com username"
            className="flex-1 px-4 py-3 rounded-lg border border-gray-300 bg-white outline-none focus:border-indigo-500"
          />
          <button
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-gray-800 text-white font-bold rounded-lg hover:bg-black disabled:opacity-40"
          >
            <RenderIcon iconType={FaMagnifyingGlass} className="text-sm" />
            <span>{isLoading ? "Loading..." : "Load Games"}</span>
          </button>
        </form>

        <div className="mt-3 text-[11px] text-gray-400">{helperText}</div>
        {errorText && <div className="mt-4 text-sm text-red-600 font-medium">{errorText}</div>}
      </div>

      {gamesResult && (
        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
          <div className="mb-4">
            <div className="font-bold text-gray-900">{gamesResult.player.username}</div>
            <a
              href={gamesResult.player.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-indigo-600 hover:underline"
            >
              Open Chess.com profile
            </a>
          </div>

          <div className="space-y-3">
            {gamesResult.games.length === 0 && (
              <div className="text-sm text-gray-500">No recent public games found.</div>
            )}
            {gamesResult.games.map(function renderGame(game) {
              return (
                <div key={game.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50 flex flex-col gap-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <div className="font-bold text-gray-900">
                        {game.white.username} vs {game.black.username}
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatTimestamp(game.endTime)} · {game.timeClass} · {game.timeControl}
                      </div>
                    </div>
                    <button
                      onClick={function handleOpen() {
                        openGame(game);
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-bold rounded hover:bg-indigo-700"
                    >
                      <RenderIcon iconType={FaArrowRight} className="text-sm" />
                      <span>Open</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div className="bg-white border border-gray-200 rounded p-3">
                      <div className="font-semibold text-gray-800">White</div>
                      <div className="text-gray-600">
                        {game.white.username}
                        {typeof game.white.rating === "number" ? ` (${game.white.rating})` : ""}
                      </div>
                      <div className="text-xs text-gray-400">Result: {game.white.result ?? "-"}</div>
                      <div className="text-xs text-gray-400">Accuracy: {formatAccuracy(game.accuracies?.white)}</div>
                    </div>
                    <div className="bg-white border border-gray-200 rounded p-3">
                      <div className="font-semibold text-gray-800">Black</div>
                      <div className="text-gray-600">
                        {game.black.username}
                        {typeof game.black.rating === "number" ? ` (${game.black.rating})` : ""}
                      </div>
                      <div className="text-xs text-gray-400">Result: {game.black.result ?? "-"}</div>
                      <div className="text-xs text-gray-400">Accuracy: {formatAccuracy(game.accuracies?.black)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const CHESS_COM_USERNAME_STORAGE_KEY = "chess-com-username";

function formatTimestamp(timestamp: number | null): string {
  if (!timestamp) return "Unknown date";
  return new Date(timestamp * 1000).toLocaleString();
}

function formatAccuracy(accuracy?: number): string {
  if (typeof accuracy !== "number") return "-";
  return `${accuracy.toFixed(1)}%`;
}

function getInitialBoardOrientation(
  game: ChessComClient.Dto.ChessComGameSummary,
  username: string | null,
): "white" | "black" {
  const normalizedUsername = username?.trim().toLowerCase();
  if (!normalizedUsername) return "white";
  if (game.black.username.trim().toLowerCase() === normalizedUsername) return "black";
  return "white";
}

export default ChessComImportPage;
