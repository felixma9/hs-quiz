import type { ReactNode } from 'react';
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

export function ClassPicker({ options, value, onPick, onClose }: PickerProps) {
  return (
    <Picker title="Class" onClose={onClose}>
      <div className="class-grid">
        {options.filter((o) => !isDual(o)).map((o) => (
          <button key={o.value} type="button" className={`class-btn ${value === o.value ? 'on' : ''}`} onClick={() => onPick(o.value)}>
            <ClassIcon cls={o.value} />
            <span>{o.label}</span>
          </button>
        ))}
      </div>
      <DualSection label="Dual-class cards" options={options} value={value} onPick={onPick} icons />
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
