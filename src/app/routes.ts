export type Route = 'menu' | 'gauntlet' | 'hsdle' | 'pvp' | 'carddb' | 'card';

export const ROUTE_TITLES: Record<Route, string> = {
  menu: 'HS Quiz',
  gauntlet: 'Gauntlet',
  hsdle: 'HSdle',
  pvp: 'Gauntlet PvP',
  carddb: 'CardDB',
  card: 'HS Quiz',
};

/** Read the current route from the URL hash (#/gauntlet, #/hsdle, #/carddb, #/card/<id>). */
export function parseRoute(hash = location.hash): Route {
  const h = hash.replace(/^#\/?/, '');
  if (h.startsWith('card/')) return 'card';
  if (h === 'hsdle' || h === 'cardle') return 'hsdle'; // old links still work
  // #/pvp?room=CODE. Room links from before (#/quickdraw, #/quickfire) still work.
  if (h.startsWith('pvp') || h.startsWith('quickdraw') || h.startsWith('quickfire')) return 'pvp';
  return h === 'gauntlet' || h === 'carddb' ? h : 'menu';
}
