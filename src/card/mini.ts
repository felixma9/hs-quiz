import type { Card } from '../lib/types';
import { ATTR, type AttrKey } from '../lib/attributes';
import { drawCard, fontsLoaded, loadSmallArt, truth, type ArtWindow, type Shown } from './sunwell';

/**
 * Miniature cards (CardDB's hover cards), drawn once and then kept, in three
 * layers of cache so showing one is almost always instant:
 *
 * 1. Ready to paint: the drawing, decoded in memory, for the cards on screen
 *    and around the pointer (the last DECODED_KEEP used).
 * 2. Compressed: a WebP of every miniature drawn or loaded this visit (~20 KB each).
 * 3. On disk (IndexedDB), so the next visit doesn't draw them again. A card is
 *    redrawn when it, or the code and assets that draw cards, change
 *    (__CARD_DRAW_VERSION__ is a hash of them, made at build time).
 *
 * The art is cross-origin without CORS, and a canvas it's drawn on can't be
 * read back or saved. So the card is drawn without it (the art window left
 * clear) and the art (the small one the round icons already show) is drawn
 * underneath each time a miniature is shown.
 */

/** Drawn this wide: sharp at the size they're shown on a high-density screen. */
const MINI_WIDTH = 300;
/** Decoded drawings kept (about half a megabyte each). */
const DECODED_KEEP = 160;
/** How many cards past the hovered one, each way, to have ready. */
const AROUND = 12;

interface Mini {
  /** What was drawn: the card's values and the drawing code's version. */
  v: string;
  w: number;
  h: number;
  art: ArtWindow;
  /** The drawing, compressed. Missing until encoded (or if it couldn't be). */
  blob?: Blob;
}

const minis = new Map<string, Mini>();
/** Ready to paint, least recently used first. */
const decoded = new Map<string, ImageBitmap | HTMLCanvasElement>();
/** The small art, once loaded (null: it failed, the window stays grey). */
const arts = new Map<string, HTMLImageElement | null>();
const preparing = new Map<string, Promise<void>>();
const drawing = new Map<string, Promise<void>>();

/** The values a card's miniature shows. */
function shownFor(card: Card): Shown {
  const shown: Shown = {};
  for (const k of Object.keys(ATTR) as AttrKey[]) shown[k] = truth(card, k);
  return shown;
}

const versions = new WeakMap<Card, string>();
/** Changes when anything drawn on the card, or the drawing code, changes. */
function versionOf(card: Card): string {
  let v = versions.get(card);
  if (!v) {
    const s = JSON.stringify([card.type, card.set, shownFor(card)]);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
    v = `${__CARD_DRAW_VERSION__}:${(h >>> 0).toString(36)}`;
    versions.set(card, v);
  }
  return v;
}

function keepDecoded(id: string, image: ImageBitmap | HTMLCanvasElement) {
  const old = decoded.get(id);
  decoded.delete(id);
  if (old && old !== image) release(old);
  decoded.set(id, image);
  while (decoded.size > DECODED_KEEP) {
    const [oldest, img] = decoded.entries().next().value!;
    decoded.delete(oldest);
    // Only let go of it if it can be decoded again; otherwise it'd have to be redrawn.
    if (minis.get(oldest)?.blob) release(img);
    else minis.delete(oldest);
  }
}
function release(img: ImageBitmap | HTMLCanvasElement) {
  if ('close' in img) img.close();
  else img.width = img.height = 0;
}

/* ---------- On disk ---------- */

const STORE = 'minis';
const VERSION_KEY = '#version';
let opening: Promise<IDBDatabase | null> | null = null;
/** The database, emptied when the drawing code has changed (every old drawing is stale then). */
function db(): Promise<IDBDatabase | null> {
  opening ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open('hs-quiz-minis', 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onerror = () => resolve(null);
      req.onsuccess = () => {
        const d = req.result;
        const tx = d.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        const get = store.get(VERSION_KEY);
        get.onsuccess = () => {
          if (get.result === __CARD_DRAW_VERSION__) return;
          store.clear();
          store.put(__CARD_DRAW_VERSION__, VERSION_KEY);
        };
        tx.oncomplete = () => resolve(d);
        tx.onerror = tx.onabort = () => resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
  return opening;
}

/** Read the saved miniatures of these cards (one transaction for all). */
async function loadSaved(cards: Card[]): Promise<void> {
  const want = cards.filter((c) => !minis.has(c.id));
  if (!want.length) return;
  const d = await db();
  if (!d) return;
  await new Promise<void>((done) => {
    try {
      const store = d.transaction(STORE, 'readonly').objectStore(STORE);
      let left = want.length;
      for (const c of want) {
        const req = store.get(c.id);
        req.onsuccess = () => {
          const m = req.result as Mini | undefined;
          if (m?.blob && m.v === versionOf(c) && !minis.has(c.id)) minis.set(c.id, m);
          if (--left === 0) done();
        };
        req.onerror = () => --left === 0 && done();
      }
    } catch {
      done();
    }
  });
}

const toSave = new Map<string, Mini>();
let saveTimer = 0;
function save(id: string, m: Mini) {
  toSave.set(id, m);
  if (saveTimer) return;
  saveTimer = window.setTimeout(async () => {
    saveTimer = 0;
    const batch = [...toSave];
    toSave.clear();
    const d = await db();
    if (!d) return;
    try {
      const store = d.transaction(STORE, 'readwrite').objectStore(STORE);
      for (const [k, m] of batch) store.put(m, k);
    } catch {
      // Full or unavailable: they're drawn again next visit.
    }
  }, 500);
}

/* ---------- Drawing ---------- */

/** Draw a card's miniature (without art). `keep`: also keep it decoded, to show soon. */
function draw(card: Card, keep: boolean): Promise<void> {
  let p = drawing.get(card.id);
  if (p) return p;
  const canvas = document.createElement('canvas');
  let art: ArtWindow | null = null;
  p = new Promise<void>((done) => {
    void drawCard(
      canvas,
      card,
      shownFor(card),
      () => {
        const m: Mini = { v: versionOf(card), w: canvas.width, h: canvas.height, art: art! };
        minis.set(card.id, m);
        if (keep) keepDecoded(card.id, canvas);
        // Saved only if drawn with the real fonts.
        if (fontsLoaded()) {
          try {
            canvas.toBlob(
              (blob) => {
                if (blob && minis.get(card.id) === m) {
                  m.blob = blob;
                  save(card.id, m);
                }
                if (!keep) release(canvas);
              },
              'image/webp',
              0.9,
            );
          } catch {
            if (!keep) release(canvas);
          }
        } else if (!keep) minis.delete(card.id);
        done();
      },
      () => true,
      { width: MINI_WIDTH, artWindow: (a) => (art = a) },
    );
  });
  drawing.set(card.id, p);
  void p.then(() => drawing.delete(card.id));
  return p;
}

/* ---------- Showing ---------- */

/** Paint a card's miniature onto `canvas` now, if it's ready (see prepareMini). */
export function paintMini(canvas: HTMLCanvasElement, card: Card): boolean {
  const m = minis.get(card.id);
  const image = decoded.get(card.id);
  if (!m || !image || !arts.has(card.id)) return false;
  keepDecoded(card.id, image); // most recently used
  canvas.width = m.w;
  canvas.height = m.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  const { clip, x, y, w, h } = m.art;
  ctx.save();
  ctx.beginPath();
  clip.forEach(([px, py], k) => (k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = 'grey';
  ctx.fillRect(0, 0, m.w, m.h);
  const art = arts.get(card.id);
  if (art) {
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(art, x, y, w, h);
  }
  ctx.restore();
  ctx.drawImage(image, 0, 0);
  return true;
}

/** Get a card's miniature ready to paint: from memory, from disk, or drawn. */
export function prepareMini(card: Card): Promise<void> {
  if (decoded.has(card.id) && arts.has(card.id)) return Promise.resolve();
  let p = preparing.get(card.id);
  if (p) return p;
  p = Promise.all([
    arts.has(card.id) ? null : loadSmallArt(card).then((img) => void arts.set(card.id, img)),
    (async () => {
      if (decoded.has(card.id)) return;
      if (!minis.has(card.id)) await loadSaved([card]);
      const blob = minis.get(card.id)?.blob;
      if (blob) {
        try {
          keepDecoded(card.id, await createImageBitmap(blob));
          return;
        } catch {
          minis.delete(card.id);
        }
      }
      if (!decoded.has(card.id)) await draw(card, true);
    })(),
  ]).then(() => {
    preparing.delete(card.id);
  });
  preparing.set(card.id, p);
  return p;
}

/** The list warmMinis is working on, for warmAround. */
let current: Card[] = [];

/**
 * Get these cards' miniatures ready, in order, in idle time: the first
 * `ready` decoded to show at once, the rest drawn (or found on disk) and
 * compressed. Returns a function that stops it.
 */
export function warmMinis(cards: Card[], ready: number): () => void {
  current = cards;
  let live = true;
  const idle = (f: (d?: IdleDeadline) => void) =>
    window.requestIdleCallback ? window.requestIdleCallback(f, { timeout: 150 }) : window.setTimeout(f, 30);
  void (async () => {
    await loadSaved(cards);
    if (!live) return;
    // The first ones, decoded (off the main thread) a few at a time.
    const first = cards.slice(0, Math.min(ready, DECODED_KEEP));
    for (let i = 0; i < first.length && live; i += 8) await Promise.all(first.slice(i, i + 8).map(prepareMini));
    // The rest: drawn one after another while the browser is idle.
    let i = 0;
    const step = (deadline?: IdleDeadline) => {
      while (live && i < cards.length && minis.has(cards[i].id)) i++;
      if (!live || i >= cards.length) return;
      void draw(cards[i], false).then(() => {
        if (!live) return;
        if (deadline && !deadline.didTimeout && deadline.timeRemaining() > 8) step(deadline);
        else idle(step);
      });
    };
    idle(step);
  })();
  return () => {
    live = false;
  };
}

/** Get the cards near this one (in the list being warmed) ready: the pointer is likely headed there. */
export function warmAround(card: Card) {
  const i = current.findIndex((c) => c.id === card.id);
  if (i < 0) return;
  for (const c of current.slice(Math.max(0, i - AROUND), i + AROUND + 1)) void prepareMini(c);
}
