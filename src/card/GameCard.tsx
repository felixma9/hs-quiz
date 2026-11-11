import { useEffect, useMemo, useRef, useState } from 'react';
import type { Card } from '../lib/types';
import { ATTR, enumOptions, pretty, type AttrKey } from '../lib/attributes';
import type { Verdict } from '../lib/grade';
import { classIcon } from '../app/icons';
import { boxStyle, layoutFor } from './layout';
import { BLANK, drawCard, truth, type Shown } from './sunwell';
import { NameEditor } from './NameEditor';
import { ClassPicker, TribePicker } from './Pickers';
import { useTapPick } from './tap';

/** Symbols that are a pain to reach on phone keyboards, offered above the card text box. */
const SYMBOLS = ['+', '-', '/', ':', '(', ')', ','];

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
  const textBox = useRef<HTMLTextAreaElement>(null);
  const keys = useTapPick();
  /** Put a symbol where the cursor is, keeping the keyboard up. */
  const insert = (sym: string) => {
    const el = textBox.current;
    if (!el) return;
    el.focus();
    el.setRangeText(sym, el.selectionStart, el.selectionEnd, 'end');
    set('text', el.value);
  };

  const shown: Shown = {};
  for (const k of Object.keys(ATTR) as AttrKey[]) {
    shown[k] = hidden.has(k) ? draft[k] || undefined : truth(card, k);
  }
  const shownKey = JSON.stringify(shown);

  useEffect(() => setActive(null), [card.id]);

  // Redraw when the card or what's shown changes. A new card draws straight away; typing is debounced.
  const drawnId = useRef<string | null>(null);
  useEffect(() => {
    const fresh = drawnId.current !== card.id;
    drawnId.current = card.id;
    if (fresh) setReady(false);
    let live = true;
    const t = setTimeout(
      () => canvas.current && drawCard(canvas.current, card, shown, () => setReady(true), () => live),
      fresh ? 0 : 120,
    );
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id, shownKey]);

  const layout = layoutFor(card);
  const canEdit = (k: AttrKey) => editable.has(k) && !!onChange;
  const set = (k: AttrKey, v: string) => onChange?.(k, v);
  const pick = (k: AttrKey, v: string) => {
    set(k, v);
    setActive(null);
  };

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
        {(card.type === 'MINION' || card.type === 'SPELL') && hotspot('tribe', card.type === 'SPELL' ? 'Spell school' : 'Tribe')}
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
          <div className="symbol-keys" style={{ bottom: `calc(100% - ${boxStyle(layout.text).top} + 4px)` }} {...keys.list}>
            {SYMBOLS.map((k) => (
              <button key={k} type="button" aria-label={`Type ${k}`} {...keys.option(() => insert(k))}>
                {k}
              </button>
            ))}
          </div>
        )}
        {active === 'text' && layout.text && (
          <textarea
            ref={textBox}
            className="card-edit card-edit-text"
            style={boxStyle(layout.text)}
            autoFocus
            value={draft.text ?? ''}
            placeholder="Card text (leave blank if none)"
            onChange={(e) => set('text', e.target.value)}
            // Close a moment after losing focus, unless a finger is on the symbol keys.
            onBlur={() => setTimeout(() => !keys.pressing.current && document.activeElement !== textBox.current && setActive(null), 150)}
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
          {shown.class && !shown.class.includes('+') && <img className="chip-class-icon" src={classIcon(shown.class)} alt="" draggable={false} />}
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
        <ClassPicker options={classOpts} value={draft.class} onPick={(v) => pick('class', v)} onClose={() => setActive(null)} />
      )}
      {active === 'tribe' && canEdit('tribe') && (
        <TribePicker
          title={card.type === 'SPELL' ? 'Spell school' : 'Tribe'}
          options={tribeOpts}
          value={draft.tribe}
          onPick={(v) => pick('tribe', v)}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}
