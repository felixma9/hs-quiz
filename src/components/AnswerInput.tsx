import { useMemo, useState } from 'react';
import type { Card } from '../lib/types';
import { ATTR, enumOptions, type AttrKey } from '../lib/attributes';
import { normalizeName } from '../lib/fuzzy';

interface Props {
  attr: AttrKey;
  value: string;
  onChange(v: string): void;
  onSubmit?(): void;
  cards: Card[];
  disabled?: boolean;
  /** Placeholder for number fields, e.g. "blank = none". */
  numberHint?: string;
  autoFocus?: boolean;
}

export function AnswerInput({ attr, value, onChange, onSubmit, cards, disabled, numberHint, autoFocus }: Props) {
  const kind = ATTR[attr].kind;
  const enter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  };

  if (kind === 'number') {
    return (
      <input
        className="in in-number"
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        placeholder={numberHint ?? '?'}
        disabled={disabled}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={enter}
      />
    );
  }
  if (kind === 'enum') return <EnumSelect attr={attr} value={value} onChange={onChange} cards={cards} disabled={disabled} />;
  if (kind === 'name')
    return <NameInput value={value} onChange={onChange} onSubmit={onSubmit} cards={cards} disabled={disabled} autoFocus={autoFocus} />;
  return (
    <textarea
      className="in in-text"
      rows={3}
      value={value}
      placeholder="Type the card text (leave blank if none)"
      disabled={disabled}
      autoFocus={autoFocus}
      autoCapitalize="sentences"
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={enter}
    />
  );
}

function EnumSelect({ attr, value, onChange, cards, disabled }: { attr: AttrKey; value: string; onChange(v: string): void; cards: Card[]; disabled?: boolean }) {
  const opts = useMemo(() => enumOptions(attr, cards), [attr, cards]);
  return (
    <select className="in in-select" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose…</option>
      {opts.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function NameInput({ value, onChange, onSubmit, cards, disabled, autoFocus }: { value: string; onChange(v: string): void; onSubmit?(): void; cards: Card[]; disabled?: boolean; autoFocus?: boolean }) {
  const [open, setOpen] = useState(false);
  const names = useMemo(() => [...new Set(cards.map((c) => c.name))].sort(), [cards]);
  const matches = useMemo(() => {
    const n = normalizeName(value);
    if (n.length < 2) return [];
    const starts = names.filter((x) => normalizeName(x).startsWith(n));
    const inside = names.filter((x) => !normalizeName(x).startsWith(n) && normalizeName(x).includes(n));
    return [...starts, ...inside].slice(0, 8);
  }, [value, names]);
  const exact = matches.length === 1 && normalizeName(matches[0]) === normalizeName(value);

  return (
    <div className="name-input">
      <input
        className="in"
        type="text"
        value={value}
        placeholder="Card name"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        disabled={disabled}
        autoFocus={autoFocus}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onSubmit) {
            e.preventDefault();
            setOpen(false);
            onSubmit();
          }
        }}
      />
      {open && !disabled && matches.length > 0 && !exact && (
        <ul className="suggest">
          {matches.map((m) => (
            <li key={m}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(m);
                  setOpen(false);
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
