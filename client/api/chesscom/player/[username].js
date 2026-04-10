import { fetchPlayer, sendError, sendJson } from "../_lib.js";

export default async function handler(request, response) {
  const username = String(request.query.username || "")
    .trim()
    .toLowerCase();

  if (!username) {
    sendJson(response, 400, { message: "Username is required" });
    return;
  }

  try {
    const player = await fetchPlayer(username);
    sendJson(response, 200, {
      username: player.username,
      url: player.url,
      avatar: player.avatar,
    });
  } catch (error) {
    sendError(response, error);
  }
}
