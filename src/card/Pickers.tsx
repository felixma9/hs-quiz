import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ClassIcon } from './ClassIcon';

type Option = { value: string; label: string };
const isDual = (o: Option) => o.value.includes('+');

/**
 * A panel that opens below the card on phones, or slides out from the card's
 * right side on wide screens. No close button: tap anywhere outside it, or press
 * Escape. Picks apply as you make them.
 */
function Picker({ title, onClose, children }: { title: string; onClose(): void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  // On narrow screens the panel opens below the card: bring it into view.
  useEffect(() => {
    if (!window.matchMedia('(min-width: 1000px)').matches) panel.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      {/* Catches the tap that closes the panel, so it doesn't also press whatever is underneath. */}
      <div className="picker-backdrop" onClick={onClose} aria-hidden="true" />
      <div ref={panel} className="picker panel" role="dialog" aria-label={title}>
        <div className="picker-head">
          <b>{title}</b>
        </div>
        {children}
      </div>
    </>
  );
}

/** Dual-class / dual-tribe options, folded away under the single ones. */
function DualSection({ label, options, value, onPick, icons }: { label: string; options: Option[]; value?: string; onPick(v: string): void; icons?: boolean }) {
  const duals = options.filter(isDual);
  if (!duals.length) return null;
  return (
    <details className="dual">
      <summary>{label}</summary>
      <div className="option-list">
        {duals.map((o) => (
          <button key={o.value} type="button" className={value === o.value ? 'on' : ''} onClick={() => onPick(o.value)}>
            {icons && o.value.split(' + ').map((c) => <ClassIcon key={c} cls={c} small />)}
            {o.label}
          </button>
        ))}
      </div>
    </details>
  );
}

interface PickerProps {
  options: Option[];
  value?: string;
  onPick(value: string): void;
  onClose(): void;
}

/** The same classes in any order ("MAGE + ROGUE" and "ROGUE + MAGE"). */
const classKey = (classes: string[]) => [...classes].sort().join('+');

/**
 * Class picker. Tap a class to pick it; or tick "Multi-class card" and toggle
 * classes on and off. Classes that no card has together with the ones ticked
 * are greyed out. A combination some card in play has is set as you go (the
 * picker stays open for a third class); one no card has (only reachable by
 * unticking) blanks the class and says so, with what would work.
 */
export function ClassPicker({ options, value, onPick, onChange, onClose }: PickerProps & { onChange(value: string): void }) {
  const singles = options.filter((o) => !isDual(o));
  const combos = useMemo(() => options.filter(isDual), [options]);
  const byKey = useMemo(() => new Map(combos.map((o) => [classKey(o.value.split(' + ')), o])), [combos]);
  const label = (c: string) => singles.find((o) => o.value === c)?.label ?? c;
  const names = (cs: string[]) => cs.map(label).join(' + ');

  const [multi, setMulti] = useState(() => !!value?.includes('+'));
  const [sel, setSel] = useState<string[]>(() => (value?.includes('+') ? value.split(' + ') : []));

  // A class can be ticked only if some card has it together with everything already ticked.
  const canAdd = (c: string) => combos.some((o) => {
    const parts = o.value.split(' + ');
    return parts.includes(c) && sel.every((x) => parts.includes(x));
  });

  const toggle = (c: string) => {
    const next = sel.includes(c) ? sel.filter((x) => x !== c) : [...sel, c];
    setSel(next);
    // One class ticked counts as that class; several, as their combination (if a card has it).
    const hit = next.length >= 2 ? byKey.get(classKey(next)) : undefined;
    onChange(next.length === 1 ? next[0] : hit ? hit.value : '');
  };
  const setMultiOn = (on: boolean) => {
    setMulti(on);
    setSel(on && value && !value.includes('+') && value !== 'NEUTRAL' ? [value] : []);
    if (!on && value?.includes('+')) onChange('');
  };

  // What to say about the current selection.
  const hit = sel.length >= 2 ? byKey.get(classKey(sel)) : undefined;
  const supersets = combos.filter((o) => sel.every((c) => o.value.split(' + ').includes(c)));
  const partners = [...new Set(supersets.flatMap((o) => o.value.split(' + ')))].filter((c) => !sel.includes(c));
  const [note, bad]: [ReactNode, boolean] = hit
    ? [
        <>
          Set to <b>{names(hit.value.split(' + '))}</b>.
        </>,
        false,
      ]
    : sel.length === 0
      ? ['Toggle the classes on the card.', false]
      : sel.length === 1
        ? partners.length
          ? [<>Now pick another class. {label(sel[0])} cards are also {partners.map(label).join(', ')}.</>, false]
          : [<>No multi-class card is {label(sel[0])}.</>, true]
        : [
            <>
              <b>Not a valid combination:</b> no card is {names(sel)}.{' '}
              {supersets.length > 0 ? <>Add {partners.map(label).join(' or ')}.</> : <>Untick a class.</>}
            </>,
            true,
          ];

  return (
    <Picker title="Class" onClose={onClose}>
      {combos.length > 0 && (
        <label className="check multi-toggle">
          <input type="checkbox" checked={multi} onChange={(e) => setMultiOn(e.target.checked)} />
          Multi-class card
        </label>
      )}
      <div className={`class-grid ${multi ? 'multi' : ''}`}>
        {singles.map((o) => {
          const on = multi ? sel.includes(o.value) : value === o.value;
          // Greyed out: Neutral (never one of several classes), and any class no card has with the ones ticked.
          const off = multi && !on && (o.value === 'NEUTRAL' || !canAdd(o.value));
          return (
            <button
              key={o.value}
              type="button"
              className={`class-btn ${on ? 'on' : ''}`}
              disabled={off}
              title={off && sel.length ? `No card is ${names([...sel, o.value])}` : undefined}
              aria-pressed={multi ? on : undefined}
              onClick={() => (multi ? toggle(o.value) : onPick(o.value))}
            >
              <ClassIcon cls={o.value} />
              <span>{o.label}</span>
              {multi && <span className="class-tick" aria-hidden="true">{on ? '✓' : ''}</span>}
            </button>
          );
        })}
      </div>
      {multi && (
        <div className={`multi-note small ${bad ? 'bad' : hit ? 'ok' : ''}`} role="status" aria-live="polite">
          {note}
        </div>
      )}
    </Picker>
  );
}

export function TribePicker({ title, options, value, onPick, onClose }: PickerProps & { title: string }) {
  return (
    <Picker title={title} onClose={onClose}>
      <div className="option-list">
        {options.filter((o) => !isDual(o)).map((o) => (
          <button key={o.value} type="button" className={value === o.value ? 'on' : ''} onClick={() => onPick(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
      <DualSection label="Dual-tribe minions" options={options} value={value} onPick={onPick} />
    </Picker>
  );
}
