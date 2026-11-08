import { useEffect, useRef, useState } from 'react';
import Sunwell from 'sunwell/dist/sunwell.web.js';
import type { Card } from '../lib/types';
import { ATTR, pretty, type AttrKey } from '../lib/attributes';
import { artUrl } from '../lib/cards';

/** Unknown stats show this in their gem. Name and text are left empty. */
const BLANK = '?';
const RENDER_WIDTH = 500;

const ASSETS = `${import.meta.env.BASE_URL}sunwell/`;
let sunwell: Sunwell | null = null;
function getSunwell(): Sunwell {
  if (!sunwell) {
    sunwell = new Sunwell({
      assetFolder: ASSETS,
      titleFont: 'Merriweather',
      gemFont: 'Merriweather',
      bodyFontRegular: 'Libre Franklin',
      bodyFontSize: 58,
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

function sunwellProps(card: Card, hidden: Set<AttrKey>, texture: HTMLImageElement | null) {
  const show = (k: AttrKey) => !hidden.has(k);
  const stat = (k: AttrKey) => (show(k) ? ATTR[k].value(card) : BLANK);
  const rarity = show('rarity') ? card.rarity : 'FREE';
  const races = card.races ?? [];
  const p: Record<string, unknown> = {
    type: card.type,
    name: show('name') ? card.name : '',
    text: show('text') ? card.text ?? '' : '',
    cost: show('cost') ? card.cost : BLANK,
    cardClass: show('class') && !card.classes ? card.cardClass : 'NEUTRAL',
    rarity,
    elite: rarity === 'LEGENDARY' && card.type === 'MINION',
    set: card.set,
    texture,
  };
  if (card.type === 'MINION') {
    p.attack = stat('attack');
    p.health = stat('health');
  } else if (card.type === 'WEAPON') {
    p.attack = stat('attack');
    p.durability = stat('health');
  } else if (card.type === 'HERO') {
    p.armor = stat('health');
  }
  // Sunwell only knows the races that existed in 2022, so we set the banner text ourselves.
  const raceText =
    card.type !== 'MINION' ? '' : !show('tribe') ? BLANK : races.map((r) => pretty('tribe', r)).join(' ');
  return { props: p, raceText };
}

interface Props {
  card: Card;
  /** Attributes left blank on the card. */
  hidden: Set<AttrKey>;
}

/** The card drawn with in-game frames (HearthSim's Sunwell), hidden fields left blank. */
export function GameCard({ card, hidden }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const hiddenKey = [...hidden].sort().join(',');

  useEffect(() => {
    let live = true;
    setReady(false);
    Promise.all([loadArt(card), loadFonts()]).then(([texture]) => {
      if (!live || !canvas.current) return;
      const { props, raceText } = sunwellProps(card, hidden, texture);
      try {
        const sw = getSunwell().createCard(props, RENDER_WIDTH, false, canvas.current, () => live && setReady(true));
        sw.raceText = raceText;
        // We draw straight onto our canvas. Without this Sunwell also copies it into an image,
        // which fails because the art is cross-origin.
        sw.target = null;
      } catch (e) {
        console.error('Card render failed', e);
      }
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id, hiddenKey]);

  // Things the old frames can't show: Demon Hunter / multiclass / spell school.
  const show = (k: AttrKey) => !hidden.has(k);
  const chips: string[] = [];
  chips.push(`Class: ${show('class') ? pretty('class', ATTR.class.value(card)) : BLANK}`);
  if (card.type === 'SPELL') chips.push(`School: ${show('tribe') ? pretty('tribe', ATTR.tribe.value(card)) : BLANK}`);

  return (
    <div className="game-card">
      <div className="game-card-frame">
        <canvas ref={canvas} className={ready ? 'ready' : ''} aria-label={show('name') ? card.name : 'Mystery card'} />
        {!ready && <div className="card-loading">Drawing card…</div>}
      </div>
      <div className="card-chips">
        {chips.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
    </div>
  );
}
