import { useEffect, useState } from 'react';
import { loadSettings } from '../modes/gauntlet/settings';
import { RARITIES } from './RarityPicker';
import { SHARE_SETS, decodeSetup, encodeSetup, shareLink, type SharedSetup } from './shareCode';

/** One line describing a setup, e.g. "Legendary · 3 sets · minions only". */
export function describeSetup(s: SharedSetup): string {
  const rarities = RARITIES.filter((r) => !s.excludedRarities.includes(r.value)).map((r) => r.label);
  const sets = SHARE_SETS.length - s.excludedSets.filter((x) => SHARE_SETS.includes(x)).length;
  const parts = [
    rarities.length === RARITIES.length ? 'All rarities' : rarities.join(', '),
    s.excludedSets.length ? `${sets} set${sets === 1 ? '' : 's'}` : 'All sets',
  ];
  if (s.gauntlet.minionsOnly) parts.push('minions only');
  return parts.join(' · ');
}

interface Props {
  excludedSets: string[];
  excludedRarities: string[];
  onApply(s: SharedSetup): void;
}

/** Menu section: copy your setup as a code or link, or paste a friend's. */
export function SharePanel({ excludedSets, excludedRarities, onApply }: Props) {
  const code = encodeSetup({ excludedSets, excludedRarities, gauntlet: loadSettings() });
  const [paste, setPaste] = useState('');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 2500);
    return () => clearTimeout(t);
  }, [note]);

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNote({ ok: true, text: `${what} copied` });
    } catch {
      setNote({ ok: false, text: "Couldn't copy" });
    }
  };
  const shareLinkNow = async () => {
    const url = shareLink(code);
    if (navigator.share) {
      try {
        await navigator.share({ title: 'HS Quiz', text: 'Play HS Quiz with my settings', url });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    copy(url, 'Link');
  };
  const apply = () => {
    const s = decodeSetup(paste);
    if (!s) return setNote({ ok: false, text: "That code doesn't look right" });
    onApply(s);
    setPaste('');
    setNote({ ok: true, text: `Using ${describeSetup(s)}` });
  };

  return (
    <div className="share-panel">
      <div className="label">Share settings</div>
      <div className="share-row">
        <code className="share-code" onClick={(e) => getSelection()?.selectAllChildren(e.currentTarget)}>
          {code}
        </code>
        <button type="button" className="btn small" onClick={() => copy(code, 'Code')}>
          Copy
        </button>
        <button type="button" className="btn small" onClick={shareLinkNow}>
          Link
        </button>
      </div>
      <form
        className="share-row"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <input
          className="in"
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder="Paste a friend's code"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Friend's settings code"
        />
        <button type="submit" className="btn small primary" disabled={!paste.trim()}>
          Use
        </button>
      </form>
      <div className={`share-note small ${note ? (note.ok ? 'ok' : 'bad') : ''}`} aria-live="polite">
        {note?.text ?? 'Sets, rarities and Gauntlet settings.'}
      </div>
    </div>
  );
}

/** Banner shown when someone opens a share link. */
export function SharedBanner({ setup, onAccept, onDismiss }: { setup: SharedSetup; onAccept(): void; onDismiss(): void }) {
  return (
    <div className="shared-banner">
      <div>
        <b>A friend shared their settings</b>
        <div className="muted small">{describeSetup(setup)}</div>
      </div>
      <div className="share-row">
        <button type="button" className="btn small primary" onClick={onAccept}>
          Use them
        </button>
        <button type="button" className="btn small" onClick={onDismiss}>
          No thanks
        </button>
      </div>
    </div>
  );
}
