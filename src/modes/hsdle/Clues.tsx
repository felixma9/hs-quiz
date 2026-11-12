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
      {armed ? 'Tap again to give up' : 'Give up'}
    </button>
  );
}

/** A clue button that unlocks after enough wrong guesses. Open or not is up to the caller (the art also goes on the card). */
export function Clue({
  label,
  left,
  answer,
  kind,
  open,
  onToggle,
}: {
  label: string;
  left: number;
  answer: Card;
  kind: 'art' | 'text';
  open: boolean;
  onToggle(): void;
}) {
  const crop = useArtCrop();
  const unlocked = left <= 0;
  return (
    <div className="clue">
      <button className={`clue-btn ${unlocked ? 'unlocked' : ''} ${open ? 'on' : ''}`} disabled={!unlocked} onClick={onToggle}>
        {label}
        <span className="small">{unlocked ? (open ? 'Hide' : 'Show') : `in ${left} ${left === 1 ? 'try' : 'tries'}`}</span>
      </button>
      {open && unlocked && (
        <div className="clue-body">
          {kind === 'art' ? (
            <Art card={answer} crop={crop} className="clue-art" alt="The mystery minion's art" />
          ) : (
            <p>{answer.text ? plainText(answer.text).split(answer.name).join('???') : 'No card text.'}</p>
          )}
        </div>
      )}
    </div>
  );
}
