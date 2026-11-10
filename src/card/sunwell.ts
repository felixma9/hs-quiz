import Sunwell from 'sunwell/dist/sunwell.web.js';
import type { Card } from '../lib/types';
import { ATTR, pretty, type AttrKey } from '../lib/attributes';
import { artUrl } from '../lib/cards';
import { fitText } from './fitText';

/**
 * Drawing cards with HearthSim's Sunwell (MIT, archived 2022). Everything that
 * knows about Sunwell's quirks lives here.
 */

/** Unknown stats show this in their gem. Name and text are left empty. */
export const BLANK = '?';
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

/** The tribe banner image, loaded up front so spells can use it too. */
let banner: Promise<unknown> | null = null;
function loadBanner() {
  const sw = getSunwell();
  banner ??= sw.fetchAsset(sw.getAssetPath('race-banner'));
  return banner;
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

/** Start loading a card's art now (e.g. the next card, during this turn) so it draws without a wait. */
export function preloadArt(card: Card) {
  void loadArt(card);
}

/** What to draw for each attribute: the truth, the player's guess, or undefined (blank). */
export type Shown = Partial<Record<AttrKey, string>>;

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
  // Sunwell only knows the races that existed in 2022 and has no spell-school banner,
  // so we set the banner text ourselves (for spells, it shows the school).
  const raceText =
    card.type !== 'MINION' && card.type !== 'SPELL'
      ? ''
      : !v.tribe
        ? BLANK
        : v.tribe === 'NONE'
          ? ''
          : v.tribe.split(' + ').map((r) => (r === 'ALL' ? 'All' : pretty('tribe', r))).join(' ');
  return { props: p, raceText };
}

/** The real value of an attribute, as the string we draw (text keeps its <b> tags). */
export function truth(card: Card, k: AttrKey): string {
  if (k === 'text') return card.text ?? '';
  const v = ATTR[k].value(card);
  return v === null ? '' : String(v);
}

/**
 * Draw a card onto the canvas. `shown` says what to draw for each attribute
 * (blank where undefined). Calls onReady once drawn.
 */
export async function drawCard(canvas: HTMLCanvasElement, card: Card, shown: Shown, onReady: () => void, isLive: () => boolean) {
  const [texture] = await Promise.all([loadArt(card), loadFonts(), loadBanner()]);
  if (!isLive()) return;
  const { props, raceText } = sunwellProps(card, shown, texture);
  try {
    // Size the text for this card so long texts aren't clipped.
    Object.assign(getSunwell().options, fitText(String(props.text ?? ''), card.type, BODY_FONT));
    const sw = getSunwell().createCard(props, RENDER_WIDTH, false, canvas, () => isLive() && onReady());
    sw.raceText = raceText;
    if (card.type === 'SPELL') {
      // Reuse the minion tribe banner as the spell-school banner, at the bottom of the card.
      sw.raceBannerAsset = 'race-banner';
      sw.raceBannerCoords = { dx: 131, dy: 806, dWidth: 408, dHeight: 69, sWidth: 408, sHeight: 69 };
      sw.raceTextCoords = { dx: 335, dy: 843 };
    }
    for (const g of [sw.costGem, sw.attackGem, sw.healthGem]) if (g) g.textSize = GEM_TEXT_SIZE;
    // We draw straight onto our canvas. Without this Sunwell also copies it into an image,
    // which fails because the art is cross-origin.
    sw.target = null;
  } catch (e) {
    console.error('Card render failed', e);
  }
}
