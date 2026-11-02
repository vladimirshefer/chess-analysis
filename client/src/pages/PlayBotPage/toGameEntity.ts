import { Chess, type Color } from "chess.js";
import { BotPlayer } from "../../lib/BotPlayer.ts";
import { ChessComUser } from "../../lib/ChessComUser.ts";
import type { ChessComGameEntity } from "../../repository/ChessComClientRepository.ts";

/** The same id is used to save the game and to build its analysis url, so it is derived from the start time. */
export function toGameId(startedAt: number): string {
  return `local-${startedAt}`;
}

function opposite(color: Color): Color {
  return color === "w" ? "b" : "w";
}

/**
 * Converts a finished game to a library entity.
 * @param resignedColor the side that resigned, if the game did not end on the board.
 */
export function toGameEntity(
  moves: string[],
  humanColor: Color,
  strength: BotPlayer.Strength,
  resignedColor: Color | null,
  startedAt: number,
  endedAt: number,
): ChessComGameEntity {
  const chess = new Chess();
  moves.forEach((san) => chess.move(san));

  const winner = resignedColor ? opposite(resignedColor) : chess.isCheckmate() ? opposite(chess.turn()) : null;
  const loserResult = resignedColor ? "resigned" : "checkmated";
  const drawResult = chess.isStalemate()
    ? "stalemate"
    : chess.isThreefoldRepetition()
      ? "repetition"
      : chess.isInsufficientMaterial()
        ? "insufficient"
        : "50move";
  function resultOf(color: Color): string {
    if (winner === null) return drawResult;
    return winner === color ? "win" : loserResult;
  }

  const botName = BotPlayer.botName(strength);
  const white = { username: humanColor === "w" ? ChessComUser.LOCAL_USERNAME : botName, result: resultOf("w") };
  const black = { username: humanColor === "b" ? ChessComUser.LOCAL_USERNAME : botName, result: resultOf("b") };

  const date = new Date(startedAt).toISOString().slice(0, 10).replaceAll("-", ".");
  chess.setHeader("Event", "Play with bot");
  chess.setHeader("Date", date);
  chess.setHeader("White", white.username);
  chess.setHeader("Black", black.username);
  chess.setHeader("Result", winner === null ? "1/2-1/2" : winner === "w" ? "1-0" : "0-1");

  const id = toGameId(startedAt);
  return {
    id,
    url: `local://game/${id}`,
    pgn: chess.pgn(),
    endTime: Math.floor(endedAt / 1000),
    timeClass: "bot",
    timeControl: "-",
    white,
    black,
  };
}
