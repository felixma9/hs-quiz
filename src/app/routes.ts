export type Route = 'menu' | 'gauntlet' | 'hsdle' | 'quickdraw' | 'card';

export const ROUTE_TITLES: Record<Route, string> = {
  menu: 'HS Quiz',
  gauntlet: 'Gauntlet',
  hsdle: 'HSdle',
  quickdraw: 'Quickdraw',
  card: 'HS Quiz',
};

/** Read the current route from the URL hash (#/gauntlet, #/hsdle, #/card/<id>). */
export function parseRoute(hash = location.hash): Route {
  const h = hash.replace(/^#\/?/, '');
  if (h.startsWith('card/')) return 'card';
  if (h === 'hsdle' || h === 'cardle') return 'hsdle'; // old links still work
  if (h.startsWith('quickdraw') || h.startsWith('quickfire')) return 'quickdraw'; // #/quickdraw?room=CODE; old quickfire links still work
  return h === 'gauntlet' ? h : 'menu';
}
