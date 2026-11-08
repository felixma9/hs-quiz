import { writeFileSync } from 'node:fs';
import { buildCards, type RawCard } from './transform';
import { SETS } from '../src/data/sets';

const SOURCE = 'https://api.hearthstonejson.com/v1/latest/enUS/cards.collectible.json';

const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`HTTP ${res.status} from ${SOURCE}`);
const raw = (await res.json()) as RawCard[];
const cards = buildCards(raw);
writeFileSync(new URL('../public/cards.json', import.meta.url), JSON.stringify(cards));

const unknown = [...new Set(cards.map((c) => c.set))].filter((s) => !SETS[s]);
console.log(`${raw.length} raw cards -> ${cards.length} playable cards`);
if (unknown.length) console.warn(`Set codes missing from src/data/sets.ts: ${unknown.join(', ')}`);
