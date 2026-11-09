export type Route = 'menu' | 'gauntlet' | 'hsdle' | 'quickfire' | 'card';

export const ROUTE_TITLES: Record<Route, string> = {
  menu: 'HS Quiz',
  gauntlet: 'Gauntlet',
  hsdle: 'HSdle',
  quickfire: 'Quickfire',
  card: 'HS Quiz',
};

/** Read the current route from the URL hash (#/gauntlet, #/hsdle, #/card/<id>). */
export function parseRoute(hash = location.hash): Route {
  const h = hash.replace(/^#\/?/, '');
  if (h.startsWith('card/')) return 'card';
  if (h === 'hsdle' || h === 'cardle') return 'hsdle'; // old links still work
  if (h.startsWith('quickfire')) return 'quickfire'; // #/quickfire?room=CODE
  return h === 'gauntlet' ? h : 'menu';
}
