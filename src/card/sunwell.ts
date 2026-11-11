import Sunwell, { type SunwellCard } from 'sunwell/dist/sunwell.web.js';
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

/**
 * Set icons Sunwell doesn't have (it stops at Rise of Shadows, 2019). Files are
 * public/sunwell/set-<code in lower case>.webp, from the Hearthstone wiki,
 * recoloured to match Sunwell's own. Basic (LEGACY) has no icon in the game either.
 */
const NEWER_SET_ICONS = new Set([
  'ULDUM', 'DRAGONS', 'YEAR_OF_THE_DRAGON', 'DEMON_HUNTER_INITIATE', 'BLACK_TEMPLE', 'SCHOLOMANCE', 'DARKMOON_FAIRE',
  'CORE', 'THE_BARRENS', 'STORMWIND', 'ALTERAC_VALLEY', 'THE_SUNKEN_CITY', 'REVENDRETH', 'PATH_OF_ARTHAS',
  'RETURN_OF_THE_LICH_KING', 'BATTLE_OF_THE_BANDS', 'TITANS', 'WILD_WEST', 'WHIZBANGS_WORKSHOP', 'WONDERS',
  'ISLAND_VACATION', 'SPACE', 'EMERALD_DREAM', 'THE_LOST_CITY', 'TIME_TRAVEL', 'CATACLYSM', 'ESCAPEFROM_VIOLET_HOLD',
  'BE', 'EVENT',
]);
export const setIconAsset = (set: string) => (NEWER_SET_ICONS.has(set) ? `set-${set.toLowerCase()}` : null);

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

/**
 * Sunwell's name and text boxes are a little wider than what our fonts can use
 * on some frames: long weapon and hero names ran off the banner (and got cut),
 * and weapon text ran past the sides of the dark plate. Narrow them.
 */
export const NAME_MAX: Record<string, number> = { WEAPON: 350, HERO: 350 };
export const WEAPON_BODY = { dx: 168, width: 344 };
function fitBoxes(sw: SunwellCard, type: string) {
  const max = NAME_MAX[type];
  if (max && sw.nameTextCurve) sw.nameTextCurve.maxWidth = max;
  if (type === 'WEAPON' && sw.bodyTextCoords) {
    Object.assign(sw.bodyTextCoords, { dx: WEAPON_BODY.dx, dWidth: WEAPON_BODY.width, sWidth: WEAPON_BODY.width });
  }
}

/** Widest tribe text (in card units) that stays on the banner's plaque. */
const RACE_TEXT_MAX = 230;
const RACE_TEXT_SIZE = 40;

/**
 * Sunwell draws the tribe at a fixed 40px into a 300px buffer, so two tribes
 * ("Elemental Mech") run off the plaque or get cut. Draw it ourselves, shrunk to fit.
 */
function fitRaceText(sw: SunwellCard) {
  const banner = sw.raceBanner;
  if (!banner) return;
  banner.render = (ctx: CanvasRenderingContext2D, ratio: number) => {
    const text = sw.raceText;
    if (!sw.raceBannerAsset || !text) return;
    const coords = sw.raceBannerCoords;
    coords.ratio = ratio;
    banner.sunwell.drawImage(ctx, sw.raceBannerAsset, coords);
    const font = (px: number) => `${px}px "Merriweather"`;
    ctx.save();
    ctx.font = font(RACE_TEXT_SIZE);
    const w = ctx.measureText(text).width;
    const size = w > RACE_TEXT_MAX ? Math.max(20, (RACE_TEXT_SIZE * RACE_TEXT_MAX) / w) : RACE_TEXT_SIZE;
    ctx.font = font(size * ratio);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const x = sw.raceTextCoords.dx * ratio;
    const y = sw.raceTextCoords.dy * ratio;
    ctx.lineWidth = 7 * (size / RACE_TEXT_SIZE) * ratio;
    ctx.strokeStyle = 'black';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = 'white';
    ctx.fillText(text, x, y);
    ctx.restore();
  };
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
    if (props.cardClass === 'DEMONHUNTER') {
      // Sunwell is older than Demon Hunter and would draw the neutral frame.
      // Our DH frames are recolored from other class frames (scripts/make-dh-frames.py).
      sw.getCardFrameAsset = () => `${sw.baseCardFrameAsset}demonhunter`;
    }
    const icon = setIconAsset(card.set);
    if (icon) sw.getWatermarkAsset = () => icon;
    if (card.type === 'SPELL') {
      // Reuse the minion tribe banner as the spell-school banner, at the bottom of the card.
      sw.raceBannerAsset = 'race-banner';
      sw.raceBannerCoords = { dx: 131, dy: 806, dWidth: 408, dHeight: 69, sWidth: 408, sHeight: 69 };
      sw.raceTextCoords = { dx: 335, dy: 843 };
    }
    fitRaceText(sw);
    fitBoxes(sw, card.type);
    for (const g of [sw.costGem, sw.attackGem, sw.healthGem]) if (g) g.textSize = GEM_TEXT_SIZE;
    // We draw straight onto our canvas. Without this Sunwell also copies it into an image,
    // which fails because the art is cross-origin.
    sw.target = null;
  } catch (e) {
    console.error('Card render failed', e);
  }
}
