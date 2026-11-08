import { useEffect, useState } from 'react';
import type { Card } from '../../lib/types';
import { plainText } from '../../lib/attributes';
import { Art, useArtCrop } from './Art';


/** Two taps to give up, so it can't happen by accident. */
export function GiveUp({ onGiveUp }: { onGiveUp(): void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button className={`give-up ${armed ? 'armed' : ''}`} onClick={() => (armed ? onGiveUp() : setArmed(true))}>
      {armed ? 'Tap again to give up and see the answer' : 'Give up'}
    </button>
  );
}

/** A clue button that unlocks after enough wrong guesses. */
export function Clue({ label, left, answer, kind }: { label: string; left: number; answer: Card; kind: 'art' | 'text' }) {
  const crop = useArtCrop();
  const [open, setOpen] = useState(false);
  const unlocked = left <= 0;
  useEffect(() => setOpen(false), [answer.id]);
  return (
    <div className="clue">
      <button className={`clue-btn ${unlocked ? 'unlocked' : ''} ${open ? 'on' : ''}`} disabled={!unlocked} onClick={() => setOpen((o) => !o)}>
        {label}
        <span className="small">{unlocked ? (open ? 'Hide' : 'Show') : `in ${left} ${left === 1 ? 'try' : 'tries'}`}</span>
      </button>
      {open && unlocked && (
        <div className="clue-body">
          {kind === 'art' ? (
            <Art card={answer} crop={crop} className="clue-art" alt="The mystery minion's art" />
          ) : (
            <p>{answer.text ? plainText(answer.text).split(answer.name).join('???') : 'This minion has no card text.'}</p>
          )}
        </div>
      )}
    </div>
  );
}
