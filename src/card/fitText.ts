/**
 * Pick a body-text size that fits the card's text box.
 *
 * Sunwell shrinks text only by fixed steps based on its length, so long cards
 * overflow and get clipped. We repeat its word-wrapping here with the real font
 * and pick the largest base size whose wrapped lines fit the box.
 */

/** Text box size per card type, in Sunwell's 670 x 1000 reference space. */
const BODY: Record<string, [number, number]> = {
  MINION: [408, 176],
  SPELL: [378, 168],
  WEAPON: [344, 168], // narrowed in sunwell.ts (WEAPON_BODY)
  HERO: [376, 168],
};

const MAX_BASE = 36;
const MIN_BASE = 10;
const LINE = 1.12;

/** Sunwell's own length-based shrink factors (font, line height). */
function lengthFactors(len: number): [number, number] {
  if (len >= 120) return [0.62, 0.8];
  if (len >= 100) return [0.8, 0.8];
  if (len >= 80) return [0.9, 0.9];
  if (len >= 65) return [0.95, 0.95];
  return [1, 1];
}

let ctx: CanvasRenderingContext2D | null = null;

function countLines(words: string[], fontPx: number, width: number, font: string, firstLineWidth: number): number {
  ctx ??= document.createElement('canvas').getContext('2d');
  if (!ctx) return 1;
  // Measure in bold: it is the widest weight, so this errs on the side of fitting.
  ctx.font = `bold ${fontPx}px "${font}"`;
  const space = ctx.measureText('M').width * 0.275;
  let lines = 1;
  let x = 0;
  let limit = firstLineWidth;
  for (const w of words) {
    const ww = ctx.measureText(w).width;
    if (x > 0 && x + ww > limit) {
      lines++;
      x = 0;
      limit = width;
    }
    x += ww + space;
  }
  return lines;
}

interface TextFit {
  bodyFontSize: number;
  bodyLineHeight: number;
  bodyFontOffset: { x: number; y: number };
}

export function fitText(text: string, type: string, font: string): TextFit {
  const [w, h] = BODY[type] ?? BODY.MINION;
  const plain = text.replace(/<\/?[bi]>/g, '');
  // Sunwell's length counts each tag as one control character.
  const len = plain.length + (text.match(/<\/?[bi]>/g)?.length ?? 0);
  const [ff, lf] = lengthFactors(len);
  const words = plain.split(/\s+/).filter(Boolean);
  const smallFirst = type === 'SPELL' && len >= 75;
  // A little slack for kerning and the box's rounded corners.
  const width = w * 0.93;
  const height = h * 0.94;

  let base = MAX_BASE;
  for (; base > MIN_BASE; base--) {
    const lines = countLines(words, base * ff, width, font, smallFirst ? width * 0.8 : width);
    if (lines * base * LINE * lf <= height) break;
  }
  return {
    bodyFontSize: base,
    bodyLineHeight: Math.round(base * LINE),
    // Sunwell puts each line's baseline at the top of its row; push it down.
    bodyFontOffset: { x: 0, y: Math.round(base * 0.83 * Math.max(lf, 0.85)) },
  };
}
