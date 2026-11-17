import { writeFileSync } from 'node:fs';
import { attachRelated, buildCards, copiesOf, relatedFromDefs, type RawCard } from './transform';
import { SETS } from '../src/data/sets';

const SOURCE = 'https://api.hearthstonejson.com/v1/latest/enUS/cards.collectible.json';
/** Every card, tokens too: what related cards are looked up in. */
const ALL = 'https://api.hearthstonejson.com/v1/latest/enUS/cards.json';
/** The game's own card definitions: the only place that says which cards go with which. */
const DEFS = 'https://raw.githubusercontent.com/HearthSim/hsdata/master/CardDefs.xml';

async function get(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res;
}

const [raw, all, defs] = await Promise.all([
  get(SOURCE).then((r) => r.json() as Promise<RawCard[]>),
  get(ALL).then((r) => r.json() as Promise<RawCard[]>),
  get(DEFS).then((r) => r.text()),
]);
const cards = buildCards(raw);
const tokens = attachRelated(cards, all, relatedFromDefs(defs), copiesOf(raw, cards));
writeFileSync(new URL('../public/cards.json', import.meta.url), JSON.stringify(cards));
writeFileSync(new URL('../public/tokens.json', import.meta.url), JSON.stringify(tokens));

const unknown = [...new Set(cards.map((c) => c.set))].filter((s) => !SETS[s]);
console.log(`${raw.length} raw cards -> ${cards.length} playable cards`);
console.log(`${cards.filter((c) => c.related).length} cards with related cards; ${tokens.length} tokens`);
if (unknown.length) console.warn(`Set codes missing from src/data/sets.ts: ${unknown.join(', ')}`);
