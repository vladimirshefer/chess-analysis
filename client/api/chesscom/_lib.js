const DEFAULT_LIMIT = 10;

export async function fetchPlayer(username) {
  return fetchChessComJson(`https://api.chess.com/pub/player/${encodeURIComponent(username)}`);
}

export async function fetchRecentGamesPayload(username, limit = DEFAULT_LIMIT) {
  const player = await fetchPlayer(username);
  const archivesResponse = await fetchChessComJson(
    `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/archives`,
  );
  const games = await collectRecentGames(archivesResponse.archives || [], limit);

  return {
    player: {
      username: player.username,
      url: player.url,
      avatar: player.avatar,
    },
    games,
  };
}

export function sendJson(response, status, payload) {
  response.status(status).json(payload);
}

export function sendError(response, error) {
  if (error && typeof error.status === "number") {
    sendJson(response, error.status, { message: error.message });
    return;
  }

  sendJson(response, 502, { message: "Unable to load Chess.com data" });
}

async function collectRecentGames(archiveUrls, limit) {
  const recentGames = [];

  for (let index = archiveUrls.length - 1; index >= 0; index -= 1) {
    const archive = await fetchChessComJson(archiveUrls[index]);
    const archiveGames = (archive.games || []).slice().reverse().map(normalizeGame).filter(Boolean);

    recentGames.push(...archiveGames);
    if (recentGames.length >= limit) break;
  }

  return recentGames.slice(0, limit);
}

function normalizeGame(game) {
  if (!game || !game.url || !game.pgn || !game.white?.username || !game.black?.username) return null;

  return {
    id: game.url,
    url: game.url,
    pgn: game.pgn,
    endTime: game.end_time ?? null,
    timeClass: game.time_class ?? "unknown",
    timeControl: game.time_control ?? "-",
    white: {
      username: game.white.username,
      rating: game.white.rating,
      result: game.white.result,
    },
    black: {
      username: game.black.username,
      rating: game.black.rating,
      result: game.black.result,
    },
    accuracies: game.accuracies
      ? {
          white: game.accuracies.white,
          black: game.accuracies.black,
        }
      : undefined,
  };
}

async function fetchChessComJson(url) {
  const response = await fetch(url);
  const payload = await response.json().catch(function ignoreJsonError() {
    return {};
  });

  if (!response.ok) {
    const error = new Error(payload.message || response.statusText || "Chess.com request failed");
    error.status = response.status;
    throw error;
  }

  return payload;
}
