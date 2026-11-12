import { useMemo, useState } from 'react';
import type { Card } from '../../lib/types';
import { ATTR, ATTRS, labelFor, plainText, pretty, type AttrKey } from '../../lib/attributes';
import { normalizeCardName, normalizeName, words } from '../../lib/fuzzy';
import { GameCard } from '../../card/GameCard';
import { Art, useArtCrop } from '../hsdle/Art';
import { zoomCard } from '../../app/CardZoom';

/**
 * CardDB: a blank card to fill in. Every part filled in narrows the list of
 * cards below, until only the one you're thinking of is left.
 */

type CardType = Card['type'];
const TYPES: { value: CardType; label: string }[] = [
  { value: 'MINION', label: 'Minion' },
  { value: 'SPELL', label: 'Spell' },
  { value: 'WEAPON', label: 'Weapon' },
  { value: 'HERO', label: 'Hero' },
  { value: 'LOCATION', label: 'Location' },
];

/** Shown per page of results; "Show more" adds another page. */
const PAGE = 60;

/** A stand-in card of this type, for the frame. Nothing of it is shown: every field is blank or filled in by the player. */
const blankCard = (type: CardType): Card => ({
  id: `blank-${type}`,
  dbfId: 0,
  name: '',
  type,
  cardClass: 'NEUTRAL',
  cost: 0,
  attack: type === 'MINION' || type === 'WEAPON' ? 0 : undefined,
  health: type === 'MINION' || type === 'LOCATION' ? 0 : undefined,
  durability: type === 'WEAPON' ? 0 : undefined,
  armor: type === 'HERO' ? 0 : undefined,
  rarity: 'FREE',
  set: '',
  races: type === 'MINION' ? [] : undefined,
  text: '',
});

/** Fields this type of card has, so the player can fill them in. */
function fieldsFor(type: CardType): AttrKey[] {
  const keys: AttrKey[] = ['name', 'class', 'cost', 'rarity', 'text'];
  if (type === 'MINION' || type === 'WEAPON') keys.push('attack');
  if (type !== 'SPELL') keys.push('health');
  if (type === 'MINION' || type === 'SPELL') keys.push('tribe');
  return keys;
}

/** Card text as words, worked out once per card (the list is filtered on every keystroke). */
const textWords = new Map<string, string[]>();
function cardWords(c: Card): string[] {
  let w = textWords.get(c.id);
  if (!w) textWords.set(c.id, (w = words(plainText(c.text))));
  return w;
}

/** Does this card fit what's filled in so far? */
function fits(c: Card, type: CardType, f: Partial<Record<AttrKey, string>>): boolean {
  if (c.type !== type) return false;
  for (const [k, raw] of Object.entries(f) as [AttrKey, string][]) {
    const v = raw.trim();
    if (!v) continue;
    const real = ATTR[k].value(c);
    switch (ATTR[k].kind) {
      case 'number':
        if (real !== Number(v)) return false;
        break;
      case 'name':
        if (!normalizeCardName(c.name).includes(normalizeName(v))) return false;
        break;
      case 'text': {
        // Every typed word starts some word of the card's text, in any order.
        const have = cardWords(c);
        if (!words(v).every((t) => have.some((w) => w.startsWith(t)))) return false;
        break;
      }
      case 'enum': {
        const parts = typeof real === 'string' ? real.split(' + ') : [];
        if (k === 'tribe') {
          if (v === 'NONE' ? real !== 'NONE' : !parts.includes(v) && !parts.includes('ALL')) return false;
        } else if (!parts.includes(v)) return false;
        break;
      }
    }
  }
  return true;
}

export function CardDb({ cards }: { cards: Card[] }) {
  const [type, setType] = useState<CardType>('MINION');
  const [filled, setFilled] = useState<Partial<Record<AttrKey, string>>>({});
  const [shown, setShown] = useState(PAGE);
  const crop = useArtCrop();

  const blank = useMemo(() => blankCard(type), [type]);
  const fields = useMemo(() => new Set(fieldsFor(type)), [type]);
  const all = useMemo(() => new Set(ATTRS.map((a) => a.key)), []);
  // Only fields this type has count (switching type keeps the rest for switching back).
  const active = Object.fromEntries(Object.entries(filled).filter(([k, v]) => fields.has(k as AttrKey) && v?.trim())) as Partial<
    Record<AttrKey, string>
  >;
  const activeKey = JSON.stringify(active);

  const matches = useMemo(
    () => cards.filter((c) => fits(c, type, active)).sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cards, type, activeKey],
  );

  const set = (k: AttrKey, v: string) => {
    setFilled((f) => ({ ...f, [k]: v }));
    setShown(PAGE);
  };
  const clear = (k?: AttrKey) => {
    setFilled((f) => {
      if (!k) return {};
      const { [k]: _, ...rest } = f;
      return rest;
    });
    setShown(PAGE);
  };

  const chips = Object.entries(active) as [AttrKey, string][];
  const one = matches.length === 1 ? matches[0] : null;

  return (
    <div className="mode carddb">
      <p className="ask center">Tap the card to fill in what you remember.</p>

      <div className="seg carddb-types" role="tablist" aria-label="Card type">
        {TYPES.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={type === t.value}
            className={type === t.value ? 'on' : ''}
            onClick={() => {
              setType(t.value);
              setShown(PAGE);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <GameCard
        card={blank}
        hidden={all}
        draft={filled}
        editable={fields}
        onChange={set}
        pool={cards}
        extras={{ art: false, set: false }}
      />

      {chips.length > 0 && (
        <div className="carddb-filters">
          {chips.map(([k, v]) => (
            <button key={k} type="button" className="chip carddb-filter" onClick={() => clear(k)} aria-label={`Clear ${ATTR[k].label}`}>
              {labelFor(ATTR[k], blank)}: <b>{ATTR[k].kind === 'enum' ? pretty(k, v) : v}</b> <span aria-hidden="true">✕</span>
            </button>
          ))}
          <button type="button" className="link" onClick={() => clear()}>
            Clear all
          </button>
        </div>
      )}

      <section className="carddb-results" aria-live="polite">
        <div className="lobby-head">
          <span className="section-label">{one ? 'Found it' : 'Matching cards'}</span>
          <span className="count-pill">{matches.length.toLocaleString()}</span>
        </div>
        {matches.length === 0 ? (
          <p className="muted small center">No matches. Remove a filter.</p>
        ) : (
          <>
            <div className={`carddb-grid ${one ? 'one' : ''}`}>
              {matches.slice(0, shown).map((c) => (
                <button key={c.id} type="button" className="carddb-hit" onClick={() => zoomCard(c)} title={c.name}>
                  <Art card={c} crop={crop} className="carddb-art" />
                  <span className="carddb-name">{c.name}</span>
                  <span className="carddb-meta muted">
                    {c.cost} mana · {pretty('class', ATTR.class.value(c) as string)}
                  </span>
                </button>
              ))}
            </div>
            {matches.length > shown && (
              <button type="button" className="btn carddb-more" onClick={() => setShown((n) => n + PAGE)}>
                Show more ({(matches.length - shown).toLocaleString()} left)
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
