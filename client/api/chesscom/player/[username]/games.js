import { fetchRecentGamesPayload, sendError, sendJson } from '../../_lib.js';

export default async function handler(request, response) {
  const username = String(request.query.username || '').trim().toLowerCase();
  const limit = parseLimit(request.query.limit);

  if (!username) {
    sendJson(response, 400, { message: 'Username is required' });
    return;
  }

  try {
    const payload = await fetchRecentGamesPayload(username, limit);
    sendJson(response, 200, payload);
  } catch (error) {
    sendError(response, error);
  }
}

function parseLimit(rawValue) {
  const parsed = Number.parseInt(String(rawValue || '10'), 10);
  if (Number.isNaN(parsed) || parsed <= 0) return 10;
  return Math.min(parsed, 25);
}
