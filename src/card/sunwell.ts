import Sunwell, { type SunwellCard } from 'sunwell/dist/sunwell.web.js';
import type { Card } from '../lib/types';
import { ATTR, pretty, type AttrKey } from '../lib/attributes';
import { artUrl } from '../lib/cards';
import { loadArtCrop } from '../lib/artCrop';
import { fitText } from './fitText';
import { applyLocationLayout } from './location';

/** Where along Sunwell's hero name curve the name is centred (it uses 0.5). Measured, see the comment where it's used. */
const HERO_NAME_MIDDLE = 0.58;

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
interface SunwellPlatform {
  requestAnimationFrame(cb: () => void): void;
  getBuffer(width?: number, height?: number, clear?: boolean): HTMLCanvasElement;
}
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
    // Sunwell waits for the next screen frame before drawing each card (up to 16ms of doing nothing).
    // It draws off screen, so start as soon as the current task ends instead.
    // (A message, not setTimeout: the browser holds chained timeouts back to 4ms each.)
    const platform = (sunwell as unknown as { platform: SunwellPlatform }).platform;
    const next: (() => void)[] = [];
    const channel = new MessageChannel();
    channel.port1.onmessage = () => next.shift()?.();
    platform.requestAnimationFrame = (cb) => {
      next.push(cb);
      channel.port2.postMessage(null);
    };
    // Sunwell reads back the pixels of its scratch canvases (to crop text to its ink) several
    // times per card. Telling the browser up front keeps them in memory instead of on the GPU,
    // where every read back stalls until the GPU catches up.
    const getBuffer = platform.getBuffer.bind(platform);
    platform.getBuffer = (w, h, clear) => {
      const c = getBuffer(w, h, clear);
      c.getContext('2d', { willReadFrequently: true });
      return c;
    };
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
/** `small`: the 256px art the round icons already show (so it's in the browser's cache), enough for a miniature. */
function loadArt(card: Card, small = false) {
  const key = small ? `${card.id}:256` : card.id;
  let p = art.get(key);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = artUrl(card, small ? 256 : 512);
    });
    art.set(key, p);
  }
  return p;
}

/** The small (256px) art the round icons show, which miniatures are drawn with. */
export const loadSmallArt = (card: Card) => loadArt(card, true);

/** Whether the card fonts really loaded (a card drawn before then would be kept with the wrong font). */
export const fontsLoaded = () =>
  ['900 40px Merriweather', '400 40px "Libre Franklin"'].every((f) => {
    try {
      return document.fonts.check(f);
    } catch {
      return false;
    }
  });

/** Start loading a card's art now (e.g. the next card, during this turn) so it draws without a wait. */
export function preloadArt(card: Card) {
  void loadArt(card);
}

/** What to draw for each attribute: the truth, the player's guess, or undefined (blank). */
export type Shown = Partial<Record<AttrKey, string>>;

function sunwellProps(card: Card, v: Shown, texture: HTMLImageElement | null) {
  const gem = (k: AttrKey) => (v[k] ? v[k] : BLANK);
  // A multi-class card is drawn once per class (see drawCard); this is the first.
  const cls = v.class ? v.class.split(' + ')[0] : 'NEUTRAL';
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
const NAME_MAX: Record<string, number> = { WEAPON: 350, HERO: 390 };
const WEAPON_BODY = { dx: 168, width: 344 };
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

/** Parts of a card that aren't attributes: false leaves them off (the art blank, no set icon). */
export interface Extras {
  art?: boolean;
  set?: boolean;
  /** Use the small (256px) art the round icons already loaded: enough for a miniature, and no download. */
  smallArt?: boolean;
  /** Draw this many pixels wide (default RENDER_WIDTH). Sunwell lays out in its own units and scales, so a smaller card is the same card. */
  width?: number;
  /**
   * Leave the art window empty and report where the art goes instead, in
   * pixels. Without the cross-origin art the canvas stays readable, so it can be
   * saved; the art is drawn under it when shown (see mini.ts).
   */
  artWindow?: (at: ArtWindow) => void;
}

/** Where a card's art goes: clipped to `clip`, filled grey, then the art drawn over `x, y, w, h`. */
export interface ArtWindow {
  clip: [number, number][];
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Sunwell has no location card (it's older than locations), so a location is
 * built on its hero card, which has the same two gems: mana and, bottom right,
 * durability where a hero has armor. applyLocationLayout then swaps in the
 * location frame and layout.
 */
function frameCard(card: Card): Card {
  return card.type === 'LOCATION' ? { ...card, type: 'HERO', armor: card.health } : card;
}

/** How far down (px) gem text is moved in Sunwell's scratch canvas. */
const GEM_TEXT_DROP = 30;
let gemTextPatched = false;
/**
 * Sunwell writes gem text 10px from the top of a scratch canvas with a
 * "hanging" baseline and a 10px black outline. Digits fit, but a "?" (our
 * blank) rises above that line, so its top was clipped flat. Moving the text
 * down inside the scratch canvas fixes it; Sunwell then crops to the ink and
 * centres it on the gem, so where digits land doesn't change. Patched once,
 * on the class that owns every gem's render.
 */
function roomForTallGemText(gem: object | undefined) {
  if (gemTextPatched || !gem) return;
  let proto = Object.getPrototypeOf(gem);
  while (proto && !Object.prototype.hasOwnProperty.call(proto, 'render')) proto = Object.getPrototypeOf(proto);
  if (!proto) return;
  gemTextPatched = true;
  const render = proto.render as (this: { sunwell: Sunwell }, ...args: unknown[]) => void;
  proto.render = function (this: { sunwell: Sunwell & { getBuffer(w: number, h: number, clear: boolean): HTMLCanvasElement } }, ...args: unknown[]) {
    const sw = this.sunwell;
    const getBuffer = sw.getBuffer;
    let used: CanvasRenderingContext2D | null = null;
    sw.getBuffer = (w, h, clear) => {
      const buffer = getBuffer.call(sw, w, h, clear);
      used = buffer.getContext('2d');
      used?.setTransform(1, 0, 0, 1, 0, GEM_TEXT_DROP);
      return buffer;
    };
    try {
      render.apply(this, args);
    } finally {
      sw.getBuffer = getBuffer;
      // Buffers are pooled: hand this one back as it was.
      (used as CanvasRenderingContext2D | null)?.setTransform(1, 0, 0, 1, 0, 0);
    }
  };
}

/** Drawings in progress, by the exact card drawn (see drawCard). */
const inFlight = new Map<string, Promise<HTMLCanvasElement>>();

/**
 * Draw a card onto the canvas. `shown` says what to draw for each attribute
 * (blank where undefined). Calls onReady once drawn.
 */
export async function drawCard(
  canvas: HTMLCanvasElement,
  card: Card,
  shown: Shown,
  onReady: () => void,
  isLive: () => boolean,
  { art = true, set = true, smallArt = false, width = RENDER_WIDTH, artWindow }: Extras = {},
) {
  const location = card.type === 'LOCATION';
  card = frameCard(card);
  const [loaded, crop] = await Promise.all([art && !artWindow ? loadArt(card, smallArt) : null, location ? loadArtCrop() : null, loadFonts(), loadBanner()]);
  if (!isLive()) return;
  const { props, raceText } = sunwellProps(card, shown, loaded);
  // No set: no watermark (Sunwell draws none for an unknown set).
  if (!set) props.set = '';
  // Sunwell caches drawn frames by the props; keep a location apart from a hero card with the same values.
  if (location) props.frame = 'location';
  // Sunwell has no split frames, so a multi-class card is drawn once per class
  // and the frames are put side by side: halves for two classes, thirds for three.
  // Only the frame differs between the copies, so the seams only show there.
  const classes = shown.class?.includes(' + ') ? shown.class.split(' + ') : [String(props.cardClass)];
  // Size the text for this card so long texts aren't clipped. Sunwell reads its options when it
  // draws, which can be after other cards were queued, so each card gets its own (see setUp).
  const fit = fitText(String(props.text ?? ''), card.type, BODY_FONT);
  try {
    const drawn = classes.map((cls, i) => {
      const cardProps = { ...props, cardClass: cls };
      // Sunwell drops a request for a card identical to one still in its queue (and never calls
      // back), so the same card drawn twice at once (the timeline's two faces) waits its turn.
      const key = JSON.stringify(cardProps);
      const draw = (inFlight.get(key) ?? Promise.resolve()).then(
        () =>
          new Promise<HTMLCanvasElement>((done) => {
            const target = i === 0 ? canvas : document.createElement('canvas');
            const sw = getSunwell().createCard(cardProps, width, false, target, () => done(target));
            setUp(sw, cls, i);
          }),
      );
      inFlight.set(key, draw);
      void draw.then(() => inFlight.get(key) === draw && inFlight.delete(key));
      return draw;
    });
    Promise.all(drawn).then(([main, ...rest]) => {
      if (!isLive()) return;
      const ctx = main.getContext('2d');
      rest.forEach((other, k) => {
        if (!ctx) return;
        const w = main.width / classes.length;
        ctx.save();
        ctx.beginPath();
        ctx.rect(w * (k + 1), 0, k === rest.length - 1 ? main.width : w, main.height);
        ctx.clip();
        ctx.drawImage(other, 0, 0);
        ctx.restore();
      });
      onReady();
    });
  } catch (e) {
    console.error('Card render failed', e);
  }

  /** Everything we change on Sunwell's card before it draws. */
  function setUp(sw: ReturnType<Sunwell['createCard']>, cls: string, i0: number) {
    // This card's own text size: a view of Sunwell with its own options (everything else is shared).
    // The card and each of its parts (body text, name banner, gems...) keep their own reference.
    const shared = getSunwell();
    const own = Object.create(shared) as typeof shared;
    own.options = { ...shared.options, ...fit };
    const parts = [sw, ...Object.values(sw)] as { sunwell?: unknown }[];
    for (const part of parts) if (part && typeof part === 'object' && part.sunwell === shared) part.sunwell = own;
    sw.raceText = raceText;
    if (location) applyLocationLayout(sw, crop?.[card.id] ?? 0);
    // Sunwell's hero name curve puts names about 34 units (of 670) left of the middle; centre them.
    // Locations are drawn as hero cards, so this covers them too.
    if (card.type === 'HERO' && sw.nameTextCurve) sw.nameTextCurve.pathMiddle = HERO_NAME_MIDDLE;
    if (cls === 'DEMONHUNTER') {
      // Sunwell is older than Demon Hunter and would draw the neutral frame.
      // Our DH frames are recolored from other class frames (scripts/make-dh-frames.py).
      sw.getCardFrameAsset = () => `${sw.baseCardFrameAsset}demonhunter`;
    }
    const icon = set ? setIconAsset(card.set) : null;
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
    roomForTallGemText(sw.costGem);
    // We draw straight onto our canvas. Without this Sunwell also copies it into an image,
    // which fails because the art is cross-origin.
    sw.target = null;
    if (artWindow) {
      // Instead of the art: note where it goes, and clear the window (the art would have covered
      // whatever was drawn there first, such as a hero's backing), so the art can go underneath.
      const part = (sw as unknown as { cardArt: { render(ctx: CanvasRenderingContext2D, ratio: number): void } }).cardArt;
      part.render = (ctx, ratio) => {
        const a = (sw as unknown as { artCoords: { dx: number; dy: number; dWidth: number; dHeight: number } }).artCoords;
        const clip = (sw as unknown as { artClipPolygon: { x: number; y: number }[] }).artClipPolygon.map(
          (pt) => [pt.x * ratio, pt.y * ratio] as [number, number],
        );
        if (i0 === 0) artWindow({ clip, x: a.dx * ratio, y: a.dy * ratio, w: a.dWidth * ratio, h: a.dHeight * ratio });
        ctx.save();
        ctx.beginPath();
        clip.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.clip();
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.restore();
      };
    }
    if (width < RENDER_WIDTH) {
      // Smaller than its artwork: shrink the art and frames smoothly. (The canvas is resized
      // when the card is created, which resets its settings, so this is set as it draws.)
      const draw = sw.draw;
      sw.draw = (c: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => {
        ctx.imageSmoothingQuality = 'high';
        draw.call(sw, c, ctx);
      };
    }
  }
}
