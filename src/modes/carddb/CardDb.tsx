import type React from 'react';
import { memo, useEffect, useMemo, useState } from 'react';
import type { Card } from '../../lib/types';
import { ATTR, ATTRS, labelFor, plainText, pretty, type AttrKey } from '../../lib/attributes';
import { normalizeCardName, normalizeName, words } from '../../lib/fuzzy';
import { GameCard } from '../../card/GameCard';
import { Art, useArtCrop } from '../hsdle/Art';
import { zoomCard } from '../../app/CardZoom';
import { usePill } from '../../app/usePill';
import { ICON } from '../../app/icons';
import { preloadArt } from '../../card/sunwell';
import { warmMinis } from '../../card/mini';
import { MiniCard } from './MiniCard';

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
/** How many matching cards get their hover miniature drawn ahead (and saved), shown or not yet. */
const WARM_AHEAD = 600;

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
        } else if (k === 'class') {
          // One class: cards that are (or include) it. Several: exactly that combination, in any order.
          const want = v.split(' + ');
          if (want.length === 1 ? !parts.includes(v) : want.length !== parts.length || !want.every((x) => parts.includes(x))) return false;
        } else if (!parts.includes(v)) return false;
        break;
      }
    }
  }
  return true;
}

/** What's filled in that this type has, ignoring empty fields. */
function activeFor(type: CardType, filled: Partial<Record<AttrKey, string>>): Partial<Record<AttrKey, string>> {
  const fields = new Set(fieldsFor(type));
  return Object.fromEntries(Object.entries(filled).filter(([k, v]) => fields.has(k as AttrKey) && v?.trim())) as Partial<Record<AttrKey, string>>;
}

/** "a and b", "a, b and c". */
const listOf = (xs: React.ReactNode[]) =>
  xs.flatMap((x, i) => (i === 0 ? [x] : [i === xs.length - 1 ? ' and ' : ', ', x]));

/**
 * The search lives in the address (#/carddb?type=SPELL&name=Fireball&cost=4), so a refresh or a
 * shared link opens the same search. Unknown types and fields are ignored.
 */
function readSearch(): { type: CardType; filled: Partial<Record<AttrKey, string>> } {
  const q = new URLSearchParams(location.hash.split('?')[1] ?? '');
  const t = q.get('type') as CardType | null;
  const type = t && TYPES.some((x) => x.value === t) ? t : 'MINION';
  const keys = new Set(ATTRS.map((a) => a.key));
  const filled: Partial<Record<AttrKey, string>> = {};
  for (const [k, v] of q) if (k !== 'type' && keys.has(k as AttrKey) && v.trim()) filled[k as AttrKey] = v;
  return { type, filled };
}

function writeSearch(type: CardType, filled: Partial<Record<AttrKey, string>>) {
  const q = new URLSearchParams();
  if (type !== 'MINION') q.set('type', type);
  for (const [k, v] of Object.entries(filled)) if (v?.trim()) q.set(k, v);
  const qs = q.toString(); // (not q.size: older Safari lacks it)
  const hash = `#/carddb${qs ? `?${qs}` : ''}`;
  // Replace, not push: typing a search shouldn't fill the Back button's history.
  if (location.hash !== hash) history.replaceState(history.state, '', hash);
}

export function CardDb({ cards }: { cards: Card[] }) {
  const typesPill = usePill<HTMLDivElement>();
  const [initial] = useState(readSearch);
  const [type, setType] = useState<CardType>(initial.type);
  const [filled, setFilled] = useState<Partial<Record<AttrKey, string>>>(initial.filled);
  useEffect(() => writeSearch(type, filled), [type, filled]);
  const [shown, setShown] = useState(PAGE);
  const crop = useArtCrop();

  const blank = useMemo(() => blankCard(type), [type]);
  const fields = useMemo(() => new Set(fieldsFor(type)), [type]);
  const all = useMemo(() => new Set(ATTRS.map((a) => a.key)), []);
  // Only fields this type has count (switching type keeps the rest for switching back).
  const active = activeFor(type, filled);
  const activeKey = JSON.stringify(active);
  const filledKey = JSON.stringify(filled);

  const matches = useMemo(
    () => cards.filter((c) => fits(c, type, active)).sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cards, type, activeKey],
  );

  // How many fit in each other type (with the parts that type has): shown when nothing fits here,
  // and under the results otherwise ("2 more results found in Spell"). A type only counts when at
  // least one filter applies to it; with none, every card of it would "match".
  const elsewhere = useMemo(
    () =>
      TYPES.filter((t) => t.value !== type)
        .map((t) => {
          const f = activeFor(t.value, filled);
          return { ...t, n: Object.keys(f).length ? cards.filter((c) => fits(c, t.value, f)).length : 0 };
        })
        .filter((t) => t.n > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cards, type, filledKey],
  );
  const switchType = (t: CardType) => {
    setType(t);
    setShown(PAGE);
  };

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

  // The results shown so far, in sections by mana cost (matches are already sorted by cost).
  const sections = useMemo(() => {
    const out: { cost: number; cards: Card[] }[] = [];
    for (const c of matches.slice(0, shown)) {
      if (out.at(-1)?.cost === c.cost) out.at(-1)!.cards.push(c);
      else out.push({ cost: c.cost, cards: [c] });
    }
    return out;
  }, [matches, shown]);
  // Get the results' small cards ready ahead (mini.ts), so hovering one shows it at once:
  // the ones shown ready to paint, the next ones drawn and saved. Only where there is a mouse to hover with.
  useEffect(() => {
    if (!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) return;
    return warmMinis(matches.slice(0, WARM_AHEAD), shown);
  }, [matches, shown]);

  const chips = Object.entries(active) as [AttrKey, string][];
  const one = matches.length === 1 ? matches[0] : null;

  return (
    <div className="mode carddb">
      <p className="ask center">Tap the card to fill in what you remember.</p>

      <div ref={typesPill} className="seg carddb-types" role="tablist" aria-label="Card type">
        {TYPES.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={type === t.value}
            className={type === t.value ? 'on' : ''}
            onClick={() => switchType(t.value)}
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
          {/* Keyed by the count, so it bumps when the number changes. */}
          <span className="count-pill" key={matches.length}>{matches.length.toLocaleString()}</span>
        </div>
        {matches.length === 0 ? (
          <p className="muted small center carddb-none">
            {elsewhere.length ? (
              <>
                No results in {TYPES.find((t) => t.value === type)!.label}, but{' '}
                {listOf(
                  elsewhere.map((t, i) => (
                    <button key={t.value} type="button" className="link carddb-elsewhere" onClick={() => switchType(t.value)}>
                      {t.n.toLocaleString()} {i === 0 ? 'found ' : ''}in {t.label}
                    </button>
                  )),
                )}
                .
              </>
            ) : (
              'No matches. Remove a filter.'
            )}
          </p>
        ) : (
          <>
            {/* Keyed by type, so the results fade in again when the type changes. One section per mana cost; its heading sticks under the title bar while its cards scroll. */}
            <div key={type} className="carddb-sections">
              {sections.map(({ cost, cards: group }) => (
                <section key={cost} className="carddb-cost" aria-label={`${cost} mana`}>
                  {!one && (
                    <h3 className="carddb-cost-head">
                      <span className="carddb-cost-gem" style={{ backgroundImage: `url(${ICON.mana})` }}>
                        {cost}
                      </span>
                      <span className="muted small">
                        {group.length.toLocaleString()} card{group.length === 1 ? '' : 's'}
                      </span>
                    </h3>
                  )}
                  <div className={`carddb-grid ${one ? 'one' : ''}`}>
                    {group.map((c) => (
                      <Hit key={c.id} card={c} crop={crop} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
            {matches.length > shown && (
              <button type="button" className="btn carddb-more" onClick={() => setShown((n) => n + PAGE)}>
                Show more ({(matches.length - shown).toLocaleString()} left)
              </button>
            )}
            {elsewhere.length > 0 && (
              <p className="muted small center carddb-also">
                {listOf(
                  elsewhere.map((t, i) => (
                    <button key={t.value} type="button" className="link carddb-elsewhere" onClick={() => switchType(t.value)}>
                      {i === 0
                        ? `${t.n.toLocaleString()} more result${t.n === 1 ? '' : 's'} found in ${t.label}`
                        : `${t.n.toLocaleString()} in ${t.label}`}
                    </button>
                  )),
                )}
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}

/**
 * One result. Its hover state is its own, so moving the mouse across the grid
 * re-renders just the two results it leaves and enters, not the page.
 */
const Hit = memo(function Hit({ card: c, crop }: { card: Card; crop: ReturnType<typeof useArtCrop> }) {
  // Under the mouse: the icon is shown as a small card.
  const [peek, setPeek] = useState(false);
  return (
    <button
      type="button"
      className="carddb-hit"
      aria-label={c.name}
      onClick={(e) => {
        // The full card grows out of the miniature (or the icon, on touch).
        const from = (e.currentTarget.querySelector('.mini.ready canvas') ?? e.currentTarget.querySelector('.carddb-art'))?.getBoundingClientRect();
        setPeek(false);
        zoomCard(c, undefined, { history: true, from });
      }}
      // Mouse only: the icon turns into a small version of the card while the pointer is on it.
      onPointerEnter={(e) => {
        if (e.pointerType !== 'mouse') return;
        setPeek(true);
        // The full card's art, so it's ready if this one is clicked.
        preloadArt(c);
      }}
      onPointerLeave={() => setPeek(false)}
    >
      <span className="carddb-icon">
        <Art card={c} crop={crop} className="carddb-art" />
        {peek && <MiniCard card={c} />}
      </span>
      <span className="carddb-name">{c.name}</span>
      <span className="carddb-meta muted">{pretty('class', ATTR.class.value(c) as string)}</span>
    </button>
  );
});
