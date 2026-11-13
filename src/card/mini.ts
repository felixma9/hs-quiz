import type { Card } from '../lib/types';
import { artUrl } from '../lib/cards';
import { ATTR, type AttrKey } from '../lib/attributes';
import { drawCard, fontsLoaded, truth, type ArtWindow, type Shown } from './sunwell';

/**
 * Miniature cards (CardDB's hover cards), drawn once and then kept, so showing
 * one is almost always instant, without holding many pictures in memory:
 *
 * 1. Ready to paint: the finished picture (art and card together) for the last
 *    READY_KEEP cards used, the ones around the pointer. This is the only part
 *    that is decoded, and the only part of any size (~0.5 MB each on a
 *    high-density screen).
 * 2. On disk (IndexedDB): a WebP of every miniature drawn (~20 KB each), read
 *    back when a card near the pointer needs it. In memory there is only each
 *    card's small description (size, where the art goes), and a drawing's WebP
 *    until it has been written. A card is redrawn when it, or the code and assets
 *    that draw cards, change (__CARD_DRAW_VERSION__ is a hash of them, made at
 *    build time).
 *
 * The art is cross-origin without CORS, and a canvas it's drawn on can't be
 * read back or saved. So the card is drawn and saved without it (the art window
 * left clear), and the art (the small one the round icons already show) is put
 * underneath when the card is got ready to paint.
 */

/** Drawn this wide: sharp at the 128px they're shown at (a little more, as they lift), for this screen. */
const MINI_WIDTH = Math.round(150 * Math.min(2, Math.max(1, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1)));
/** Finished pictures kept ready to paint. */
const READY_KEEP = 24;
/** How many cards past the hovered one, each way, to have ready. */
const AROUND = 8;
/** How many of the first results to have ready before any hover. */
const READY_FIRST = 12;

/** What was drawn, without the picture itself. */
interface Meta {
  /** The card's values, the drawing code's version and the width. */
  v: string;
  w: number;
  h: number;
  art: ArtWindow;
}

/** Cards with a saved (or soon saved) drawing that is up to date. */
const metas = new Map<string, Meta>();
/** Drawings not yet written to disk (they stay here if there's no disk to write to). */
const unsaved = new Map<string, Blob>();
/** Ready to paint, least recently used first. */
const ready = new Map<string, HTMLCanvasElement>();
const preparing = new Map<string, Promise<void>>();
const drawing = new Map<string, Promise<Drawn>>();

/** The values a card's miniature shows. */
function shownFor(card: Card): Shown {
  const shown: Shown = {};
  for (const k of Object.keys(ATTR) as AttrKey[]) shown[k] = truth(card, k);
  return shown;
}

const versions = new WeakMap<Card, string>();
/** Changes when anything drawn on the card, the drawing code, or the width changes. */
function versionOf(card: Card): string {
  let v = versions.get(card);
  if (!v) {
    const s = JSON.stringify([card.type, card.set, shownFor(card)]);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
    v = `${__CARD_DRAW_VERSION__}:${MINI_WIDTH}:${(h >>> 0).toString(36)}`;
    versions.set(card, v);
  }
  return v;
}

function keepReady(id: string, image: HTMLCanvasElement) {
  const old = ready.get(id);
  ready.delete(id);
  if (old && old !== image) release(old);
  ready.set(id, image);
  while (ready.size > READY_KEEP) {
    const [oldest, img] = ready.entries().next().value!;
    ready.delete(oldest);
    release(img);
  }
}
/** Let a canvas's pixels go now rather than whenever it's collected. */
function release(c: HTMLCanvasElement) {
  c.width = c.height = 0;
}

/* ---------- On disk ---------- */

const META = 'meta';
const PICS = 'pics';
const VERSION_KEY = '#version';
let opening: Promise<IDBDatabase | null> | null = null;
/** The database, emptied when the drawing code has changed (every old drawing is stale then). */
function db(): Promise<IDBDatabase | null> {
  opening ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open('hs-quiz-minis', 2);
      req.onupgradeneeded = () => {
        const d = req.result;
        for (const name of [...d.objectStoreNames]) d.deleteObjectStore(name);
        d.createObjectStore(META);
        d.createObjectStore(PICS);
      };
      req.onerror = () => resolve(null);
      req.onsuccess = () => {
        const d = req.result;
        const tx = d.transaction([META, PICS], 'readwrite');
        const meta = tx.objectStore(META);
        const get = meta.get(VERSION_KEY);
        get.onsuccess = () => {
          if (get.result === __CARD_DRAW_VERSION__) return;
          meta.clear();
          tx.objectStore(PICS).clear();
          meta.put(__CARD_DRAW_VERSION__, VERSION_KEY);
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

/** Read one value per key from a store, in one transaction. */
async function readAll<T>(store: string, keys: string[]): Promise<(T | undefined)[]> {
  const d = keys.length ? await db() : null;
  if (!d) return keys.map(() => undefined);
  return new Promise((done) => {
    const out: (T | undefined)[] = new Array(keys.length);
    try {
      const tx = d.transaction(store, 'readonly');
      const s = tx.objectStore(store);
      keys.forEach((k, i) => {
        const req = s.get(k);
        req.onsuccess = () => (out[i] = req.result as T | undefined);
      });
      tx.oncomplete = () => done(out);
      tx.onerror = tx.onabort = () => done(out);
    } catch {
      done(out);
    }
  });
}

/** Learn which of these cards have an up-to-date drawing saved (only their small descriptions are read). */
async function loadMetas(cards: Card[]): Promise<void> {
  const want = cards.filter((c) => !metas.has(c.id));
  const found = await readAll<Meta>(META, want.map((c) => c.id));
  want.forEach((c, i) => {
    const m = found[i];
    if (m && m.v === versionOf(c) && !metas.has(c.id)) metas.set(c.id, m);
  });
}

/** A card's saved drawing: not yet written, or read from disk. */
async function picture(id: string): Promise<Blob | null> {
  return unsaved.get(id) ?? (await readAll<Blob>(PICS, [id]))[0] ?? null;
}

let saveTimer = 0;
function save() {
  if (saveTimer) return;
  saveTimer = window.setTimeout(async () => {
    saveTimer = 0;
    const d = await db();
    if (!d) return; // No disk: they stay in `unsaved`.
    const batch = [...unsaved];
    try {
      const tx = d.transaction([META, PICS], 'readwrite');
      for (const [id, blob] of batch) {
        const m = metas.get(id);
        if (!m) continue;
        tx.objectStore(META).put(m, id);
        tx.objectStore(PICS).put(blob, id);
      }
      // Written: let go of them (unless drawn again meanwhile).
      tx.oncomplete = () => batch.forEach(([id, blob]) => unsaved.get(id) === blob && unsaved.delete(id));
    } catch {
      // Full or unavailable: kept in memory, and drawn again next visit.
    }
  }, 500);
}

/* ---------- Drawing ---------- */

interface Drawn {
  canvas: HTMLCanvasElement;
  meta: Meta;
}

/**
 * Draw a card's miniature (without art) and save it. Gives the drawing if
 * `keep` (the caller releases it), else releases it itself.
 */
function draw(card: Card, keep: boolean): Promise<Drawn | null> {
  let p = drawing.get(card.id);
  if (!p) {
    const canvas = document.createElement('canvas');
    let art: ArtWindow | null = null;
    p = new Promise<Drawn>((done) => {
      void drawCard(
        canvas,
        card,
        shownFor(card),
        () => {
          const meta: Meta = { v: versionOf(card), w: canvas.width, h: canvas.height, art: art! };
          // Saved only if drawn with the real fonts.
          if (!fontsLoaded()) return done({ canvas, meta });
          try {
            canvas.toBlob(
              (blob) => {
                if (blob) {
                  metas.set(card.id, meta);
                  unsaved.set(card.id, blob);
                  save();
                }
                done({ canvas, meta });
              },
              'image/webp',
              0.9,
            );
          } catch {
            done({ canvas, meta });
          }
        },
        () => true,
        { width: MINI_WIDTH, artWindow: (a) => (art = a) },
      );
    });
    drawing.set(card.id, p);
    // Once everyone waiting has had it: let it go unless someone is still finishing it.
    void p.then((d) => {
      drawing.delete(card.id);
      if (!keepers.has(card.id)) release(d.canvas);
    });
  }
  if (!keep) return p.then(() => null);
  keepers.add(card.id);
  return p.then((d) => {
    keepers.delete(card.id);
    return d;
  });
}
/** Cards whose drawing a caller is still using. */
const keepers = new Set<string>();

/* ---------- Showing ---------- */

/** The small art the round icons show (so it's usually in the browser's memory already). Null if it fails. */
function loadArt(card: Card): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = artUrl(card, 256);
  });
}

/** The finished picture: the art under its window, the card over it. */
function finish(m: Meta, card: CanvasImageSource, art: HTMLImageElement | null): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = m.w;
  out.height = m.h;
  const ctx = out.getContext('2d')!;
  const { clip, x, y, w, h } = m.art;
  ctx.save();
  ctx.beginPath();
  clip.forEach(([px, py], k) => (k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = 'grey';
  ctx.fillRect(0, 0, m.w, m.h);
  if (art) {
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(art, x, y, w, h);
  }
  ctx.restore();
  ctx.drawImage(card, 0, 0);
  return out;
}

/** Paint a card's miniature onto `canvas` now, if it's ready (see prepareMini). */
export function paintMini(canvas: HTMLCanvasElement, card: Card): boolean {
  const image = ready.get(card.id);
  if (!image) return false;
  keepReady(card.id, image); // most recently used
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  ctx.drawImage(image, 0, 0);
  return true;
}

/** Get a card's miniature ready to paint: from disk, or drawn. */
export function prepareMini(card: Card): Promise<void> {
  if (ready.has(card.id)) return Promise.resolve();
  let p = preparing.get(card.id);
  if (p) return p;
  p = (async () => {
    const art = loadArt(card);
    if (!metas.has(card.id)) await loadMetas([card]);
    const m = metas.get(card.id);
    const blob = m && (await picture(card.id));
    if (m && blob) {
      try {
        const bitmap = await createImageBitmap(blob);
        keepReady(card.id, finish(m, bitmap, await art));
        bitmap.close();
        return;
      } catch {
        metas.delete(card.id);
      }
    }
    // Not saved (or unreadable): draw it.
    const drawn = await draw(card, true);
    if (!drawn) return;
    keepReady(card.id, finish(drawn.meta, drawn.canvas, await art));
    release(drawn.canvas);
  })().finally(() => preparing.delete(card.id));
  preparing.set(card.id, p);
  return p;
}

/** The list warmMinis is working on, for warmAround. */
let current: Card[] = [];

/**
 * Get these cards' miniatures ready ahead, in idle time: the first few `shown`
 * ready to paint, all of them drawn (or found on disk) and saved. Returns a
 * function that stops it.
 */
export function warmMinis(cards: Card[], shown: number): () => void {
  current = cards;
  let live = true;
  const idle = (f: (d?: IdleDeadline) => void) =>
    window.requestIdleCallback ? window.requestIdleCallback(f, { timeout: 150 }) : window.setTimeout(f, 30);
  void (async () => {
    await loadMetas(cards);
    if (!live) return;
    const first = cards.slice(0, Math.min(shown, READY_FIRST));
    for (let i = 0; i < first.length && live; i += 4) await Promise.all(first.slice(i, i + 4).map(prepareMini));
    // The rest: drawn one after another while the browser is idle.
    let i = 0;
    const step = (deadline?: IdleDeadline) => {
      while (live && i < cards.length && metas.has(cards[i].id)) i++;
      if (!live || i >= cards.length) return;
      const card = cards[i++];
      void draw(card, false).then(() => {
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
  // Nearest first, so they're the last to be let go.
  for (let d = AROUND; d >= 1; d--) {
    for (const c of [current[i - d], current[i + d]]) if (c) void prepareMini(c);
  }
}
