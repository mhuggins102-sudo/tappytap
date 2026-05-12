import {
  getRankAndDistribution,
  isValidDate,
  isValidPlayerId,
  json,
  type PagesFunction,
} from '../_shared';

export const onRequestGet: PagesFunction = async ({ request, env }) => {
  const url = new URL(request.url);
  const date = url.searchParams.get('date');
  const playerId = url.searchParams.get('playerId');
  if (!isValidDate(date) || !isValidPlayerId(playerId)) {
    return json({ error: 'invalid params' }, 400);
  }
  const stats = await getRankAndDistribution(env.DB, date, playerId);
  return json(stats);
};
