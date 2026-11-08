import { useEffect, useMemo, useRef, useState } from 'react';
import Sunwell from 'sunwell/dist/sunwell.web.js';
import type { Card } from '../lib/types';
import { ATTR, enumOptions, pretty, type AttrKey } from '../lib/attributes';
import type { Verdict } from '../lib/grade';
import { artUrl } from '../lib/cards';
import { normalizeName } from '../lib/fuzzy';
import { badge } from '../data/classes';
import { boxStyle, layoutFor } from './cardLayout';
import { fitText } from './fitText';

/** Unknown stats show this in their gem. Name and text are left empty. */
const BLANK = '?';
const RENDER_WIDTH = 500;
/** Sunwell's default (124) is sized for the Belwe font; Merriweather is wider. */
const GEM_TEXT_SIZE = 80;

const ASSETS = `${import.meta.env.BASE_URL}sunwell/`;
const BODY_FONT = 'Libre Franklin';
let sunwell: Sunwell | null = null;
function getSunwell(): Sunwell {
  if (!sunwell) {
    sunwell = new Sunwell({
      assetFolder: ASSETS,
      titleFont: 'Merriweather',
      gemFont: 'Merriweather',
      bodyFontRegular: BODY_FONT,
      bodyFontSize: 36,
      bodyLineHeight: 40,
      // Sunwell draws each text line with its baseline at the top of the line,
      // so without this offset only descenders show.
      bodyFontOffset: { x: 0, y: 30 },
      drawTimeout: 10000,
    });
    // Assets were converted to WebP to keep the download small.
    sunwell.getAssetPath = (key: string) => `${ASSETS}${key}.webp`;
  }
  return sunwell;
}

let fontsReady: Promise<unknown> | null = null;
function loadFonts() {
  fontsReady ??= Promise.all(
    ['900 40px Merriweather', '400 40px "Libre Franklin"', '700 40px "Libre Franklin"', 'italic 400 40px "Libre Franklin"'].map((f) =>
      document.fonts.load(f).catch(() => null),
    ),
  );
  return fontsReady;
}

/** Card art cache. Loaded without CORS (the art host sends no CORS headers); Sunwell only draws it. */
const art = new Map<string, Promise<HTMLImageElement | null>>();
function loadArt(card: Card) {
  let p = art.get(card.id);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = artUrl(card);
    });
    art.set(card.id, p);
  }
  return p;
}

/** What to draw for each attribute: the truth, the player's guess, or undefined (blank). */
type Shown = Partial<Record<AttrKey, string>>;

function sunwellProps(card: Card, v: Shown, texture: HTMLImageElement | null) {
  const gem = (k: AttrKey) => (v[k] ? v[k] : BLANK);
  const cls = v.class && !v.class.includes('+') ? v.class : 'NEUTRAL';
  const rarity = v.rarity || 'FREE';
  const p: Record<string, unknown> = {
    type: card.type,
    name: v.name ?? '',
    text: v.text ?? '',
    cost: gem('cost'),
    cardClass: cls,
    rarity,
    elite: rarity === 'LEGENDARY' && card.type === 'MINION',
    set: card.set,
    texture,
  };
  if (card.type === 'MINION') {
    p.attack = gem('attack');
    p.health = gem('health');
  } else if (card.type === 'WEAPON') {
    p.attack = gem('attack');
    p.durability = gem('health');
  } else if (card.type === 'HERO') {
    p.armor = gem('health');
  }
  // Sunwell only knows the races that existed in 2022, so we set the banner text ourselves.
  const raceText =
    card.type !== 'MINION' ? '' : !v.tribe ? BLANK : v.tribe === 'NONE' ? '' : v.tribe.split(' + ').map((r) => (r === 'ALL' ? 'All' : pretty('tribe', r))).join(' ');
  return { props: p, raceText };
}

/** The real value of an attribute, as the string we draw (text keeps its <b> tags). */
function truth(card: Card, k: AttrKey): string {
  if (k === 'text') return card.text ?? '';
  const v = ATTR[k].value(card);
  return v === null ? '' : String(v);
}

interface Props {
  card: Card;
  /** Attributes the player doesn't know yet. */
  hidden: Set<AttrKey>;
  /** The player's current answers for hidden attributes. */
  draft?: Partial<Record<AttrKey, string>>;
  /** Hidden attributes the player can fill in by tapping the card. */
  editable?: Set<AttrKey>;
  onChange?(key: AttrKey, value: string): void;
  /** Feedback from the last guess, shown as outlines. */
  verdicts?: Partial<Record<AttrKey, Verdict>>;
  /** Cards in play, for name suggestions and tribe lists. */
  pool: Card[];
  /** Called on Enter in a number or name field (Gauntlet submits). */
  onEnter?(): void;
}

/**
 * The card drawn with in-game frames (HearthSim's Sunwell). Hidden fields are
 * blank, and the player fills them in by tapping that part of the card.
 */
export function GameCard({ card, hidden, draft = {}, editable = new Set(), onChange, verdicts = {}, pool, onEnter }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState<AttrKey | null>(null);

  const shown: Shown = {};
  for (const k of Object.keys(ATTR) as AttrKey[]) {
    shown[k] = hidden.has(k) ? draft[k] || undefined : truth(card, k);
  }
  const shownKey = JSON.stringify(shown);

  useEffect(() => setActive(null), [card.id]);

  // Redraw when the card or what's shown changes; typing is debounced.
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      Promise.all([loadArt(card), loadFonts()]).then(([texture]) => {
        if (!live || !canvas.current) return;
        const { props, raceText } = sunwellProps(card, shown, texture);
        try {
          // Size the text for this card so long texts aren't clipped.
          Object.assign(getSunwell().options, fitText(String(props.text ?? ''), card.type, BODY_FONT));
          const sw = getSunwell().createCard(props, RENDER_WIDTH, false, canvas.current, () => live && setReady(true));
          sw.raceText = raceText;
          for (const g of [sw.costGem, sw.attackGem, sw.healthGem]) if (g) g.textSize = GEM_TEXT_SIZE;
          // We draw straight onto our canvas. Without this Sunwell also copies it into an image,
          // which fails because the art is cross-origin.
          sw.target = null;
        } catch (e) {
          console.error('Card render failed', e);
        }
      });
    }, ready ? 120 : 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id, shownKey]);
  useEffect(() => setReady(false), [card.id]);

  const layout = layoutFor(card);
  const canEdit = (k: AttrKey) => editable.has(k) && !!onChange;
  const set = (k: AttrKey, v: string) => onChange?.(k, v);

  const typePool = useMemo(() => pool.filter((c) => c.type === card.type), [pool, card.type]);
  const classOpts = useMemo(() => enumOptions('class', pool), [pool]);
  const singleClasses = classOpts.filter((o) => !o.value.includes('+'));
  const rarityOpts = useMemo(() => enumOptions('rarity', typePool), [typePool]);
  const tribeOpts = useMemo(() => enumOptions('tribe', typePool), [typePool]);
  const singleTribes = tribeOpts.filter((o) => !o.value.includes('+'));

  const cycle = (k: AttrKey, opts: { value: string }[]) => {
    const vals = opts.map((o) => o.value);
    const i = vals.indexOf(draft[k] ?? '');
    set(k, vals[(i + 1) % vals.length]);
  };

  const tap = (k: AttrKey) => {
    if (!canEdit(k)) return;
    if (k === 'class') {
      cycle('class', singleClasses);
      setActive('class');
    } else if (k === 'tribe') {
      cycle('tribe', singleTribes);
      setActive('tribe');
    } else if (k === 'rarity') {
      cycle('rarity', rarityOpts);
      setActive(null);
    } else {
      setActive(active === k ? null : k);
    }
  };

  const outline = (k: AttrKey) => {
    const v = verdicts[k];
    return `${canEdit(k) ? 'editable' : ''} ${v ? `v-${v}` : ''} ${active === k ? 'active' : ''}`;
  };

  const hotspot = (k: AttrKey, label: string) => {
    const box = layout[k];
    if (!box || (!canEdit(k) && !verdicts[k])) return null;
    return (
      <button
        key={k}
        type="button"
        className={`hotspot hs-${k} ${outline(k)}`}
        style={boxStyle(box)}
        aria-label={label}
        onClick={() => tap(k)}
      />
    );
  };

  const show = (k: AttrKey) => !hidden.has(k);
  const classLabel = shown.class ? pretty('class', shown.class) : BLANK;
  const schoolLabel = shown.tribe ? pretty('tribe', shown.tribe) : BLANK;

  return (
    <div className="game-card">
      <div className="game-card-frame">
        <canvas ref={canvas} className={ready ? 'ready' : ''} aria-label={show('name') ? card.name : 'Mystery card'} />
        {!ready && <div className="card-loading">Drawing card…</div>}

        {/* The frame itself: tap to cycle the class. */}
        {canEdit('class') && (
          <button type="button" className={`hotspot hs-frame ${outline('class')}`} aria-label="Class (tap to cycle)" onClick={() => tap('class')} />
        )}
        {hotspot('name', 'Name')}
        {hotspot('text', 'Card text')}
        {card.type === 'MINION' && hotspot('tribe', 'Tribe')}
        {hotspot('rarity', 'Rarity (tap to cycle)')}
        {hotspot('cost', 'Cost')}
        {hotspot('attack', 'Attack')}
        {hotspot('health', ATTR.health.labelFor?.(card) ?? 'Health')}

        {active && ATTR[active].kind === 'number' && layout[active] && (
          <input
            className="card-edit card-edit-number"
            style={boxStyle(layout[active]!)}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoFocus
            value={draft[active] ?? ''}
            onChange={(e) => set(active, e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
            onBlur={() => setActive(null)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                setActive(null);
                onEnter?.();
              }
            }}
          />
        )}
        {active === 'name' && layout.name && (
          <NameEditor
            box={layout.name}
            value={draft.name ?? ''}
            onChange={(v) => set('name', v)}
            onDone={(submit) => {
              setActive(null);
              if (submit) onEnter?.();
            }}
            pool={pool}
          />
        )}
        {active === 'text' && layout.text && (
          <textarea
            className="card-edit card-edit-text"
            style={boxStyle(layout.text)}
            autoFocus
            value={draft.text ?? ''}
            placeholder="Card text (leave blank if none)"
            onChange={(e) => set('text', e.target.value)}
            onBlur={() => setActive(null)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                setActive(null);
              }
            }}
          />
        )}
      </div>

      <div className="card-chips">
        <button
          type="button"
          className={`chip ${outline('class')}`}
          disabled={!canEdit('class') && !verdicts.class}
          onClick={() => canEdit('class') && setActive(active === 'class' ? null : 'class')}
        >
          {shown.class && !shown.class.includes('+') && <span className="badge-dot" style={{ background: badge(shown.class).color }} />}
          Class: {classLabel}
        </button>
        {card.type === 'SPELL' && (
          <button
            type="button"
            className={`chip ${outline('tribe')}`}
            disabled={!canEdit('tribe') && !verdicts.tribe}
            onClick={() => tap('tribe')}
          >
            School: {schoolLabel}
          </button>
        )}
      </div>

      {active === 'class' && canEdit('class') && (
        <Picker title="Class" onClose={() => setActive(null)}>
          <div className="class-grid">
            {singleClasses.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`class-btn ${draft.class === o.value ? 'on' : ''}`}
                onClick={() => {
                  set('class', o.value);
                  setActive(null);
                }}
              >
                <span className="class-icon" style={{ background: badge(o.value).color }}>
                  {badge(o.value).symbol}
                </span>
                <span>{o.label}</span>
              </button>
            ))}
          </div>
          {classOpts.length > singleClasses.length && (
            <details className="dual">
              <summary>Dual-class cards</summary>
              <div className="option-list">
                {classOpts
                  .filter((o) => o.value.includes('+'))
                  .map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      className={draft.class === o.value ? 'on' : ''}
                      onClick={() => {
                        set('class', o.value);
                        setActive(null);
                      }}
                    >
                      {o.value.split(' + ').map((c) => (
                        <span key={c} className="class-icon small" style={{ background: badge(c).color }}>
                          {badge(c).symbol}
                        </span>
                      ))}
                      {o.label}
                    </button>
                  ))}
              </div>
            </details>
          )}
        </Picker>
      )}

      {active === 'tribe' && canEdit('tribe') && (
        <Picker title={card.type === 'SPELL' ? 'Spell school' : 'Tribe'} onClose={() => setActive(null)}>
          <div className="option-list">
            {singleTribes.map((o) => (
              <button
                key={o.value}
                type="button"
                className={draft.tribe === o.value ? 'on' : ''}
                onClick={() => {
                  set('tribe', o.value);
                  setActive(null);
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
          {tribeOpts.length > singleTribes.length && (
            <details className="dual">
              <summary>Dual-tribe minions</summary>
              <div className="option-list">
                {tribeOpts
                  .filter((o) => o.value.includes('+'))
                  .map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      className={draft.tribe === o.value ? 'on' : ''}
                      onClick={() => {
                        set('tribe', o.value);
                        setActive(null);
                      }}
                    >
                      {o.label}
                    </button>
                  ))}
              </div>
            </details>
          )}
        </Picker>
      )}
    </div>
  );
}

function Picker({ title, onClose, children }: { title: string; onClose(): void; children: React.ReactNode }) {
  return (
    <div className="picker panel">
      <div className="picker-head">
        <b>{title}</b>
        <button type="button" className="link" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      {children}
    </div>
  );
}

function NameEditor({
  box,
  value,
  onChange,
  onDone,
  pool,
}: {
  box: [number, number, number, number];
  value: string;
  onChange(v: string): void;
  onDone(submit: boolean): void;
  pool: Card[];
}) {
  const names = useMemo(() => [...new Set(pool.map((c) => c.name))].sort(), [pool]);
  const matches = useMemo(() => {
    const n = normalizeName(value);
    if (n.length < 2) return [];
    const starts = names.filter((x) => normalizeName(x).startsWith(n));
    const inside = names.filter((x) => !normalizeName(x).startsWith(n) && normalizeName(x).includes(n));
    return [...starts, ...inside].slice(0, 6);
  }, [value, names]);
  const exact = matches.length === 1 && normalizeName(matches[0]) === normalizeName(value);

  return (
    <div className="card-edit-name" style={boxStyle(box)}>
      <input
        className="card-edit"
        autoFocus
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="Card name"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setTimeout(() => onDone(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onDone(true);
          }
        }}
      />
      {matches.length > 0 && !exact && (
        <ul className="suggest">
          {matches.map((m) => (
            <li key={m}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(m);
                  onDone(false);
                }}
              >
                {m}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
