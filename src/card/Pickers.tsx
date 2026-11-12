import { useMemo, useState, type ReactNode } from 'react';
import { ClassIcon } from './ClassIcon';

type Option = { value: string; label: string };
const isDual = (o: Option) => o.value.includes('+');

function Picker({ title, onClose, children }: { title: string; onClose(): void; children: ReactNode }) {
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
 * classes on and off. A combination some card in play has is set as you go
 * (the picker stays open for a third class); one no card has blanks the
 * class and says so, with what would work.
 */
export function ClassPicker({ options, value, onPick, onChange, onClose }: PickerProps & { onChange(value: string): void }) {
  const singles = options.filter((o) => !isDual(o));
  const combos = useMemo(() => options.filter(isDual), [options]);
  const byKey = useMemo(() => new Map(combos.map((o) => [classKey(o.value.split(' + ')), o])), [combos]);
  const label = (c: string) => singles.find((o) => o.value === c)?.label ?? c;
  const names = (cs: string[]) => cs.map(label).join(' + ');

  const [multi, setMulti] = useState(() => !!value?.includes('+'));
  const [sel, setSel] = useState<string[]>(() => (value?.includes('+') ? value.split(' + ') : []));

  const toggle = (c: string) => {
    const next = sel.includes(c) ? sel.filter((x) => x !== c) : [...sel, c];
    setSel(next);
    const hit = next.length >= 2 ? byKey.get(classKey(next)) : undefined;
    onChange(hit ? hit.value : '');
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
          Set to <b>{names(hit.value.split(' + '))}</b>.{partners.length > 0 && <> You can add {partners.map(label).join(' or ')} too.</>}
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
          // Neutral can't be one of several classes.
          const off = multi && o.value === 'NEUTRAL';
          return (
            <button
              key={o.value}
              type="button"
              className={`class-btn ${on ? 'on' : ''}`}
              disabled={off}
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
      {multi && hit && (
        <button type="button" className="btn small primary multi-done" onClick={onClose}>
          Done
        </button>
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
