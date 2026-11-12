/**
 * Location cards for Sunwell, which is older than locations (2022). A location
 * is drawn as a hero card (same gems: mana top left, a grey shield bottom right
 * that heroes use for armor) with the location frame and layout swapped in.
 *
 * Frames are public/sunwell/frame-location-<class>.webp, made by
 * scripts/make-location-frames.py from the Hearthstone wiki's location frames
 * (Neutral is recoloured from Mage). All coordinates are in Sunwell's
 * 670 x 1000 card space.
 */

/** Where the 551 x 800 frame image sits. */
const FRAME = { dx: 57, dy: 80, sWidth: 551, sHeight: 800, dWidth: 551, dHeight: 800 };

/**
 * The art window's outline, traced from the frame's transparent middle (see
 * the script) and grown a few units so no gap shows under the frame's edge.
 */
const WINDOW: [number, number][] = [
  [261, 70], [246, 78], [238, 86], [193, 94], [158, 102], [137, 110], [133, 118], [124, 126], [109, 134], [61, 142],
  [56, 150], [53, 158], [51, 166], [50, 174], [51, 182], [54, 190], [57, 198], [60, 206], [63, 214], [67, 222],
  [69, 230], [72, 238], [74, 246], [75, 254], [76, 262], [77, 270], [76, 278], [74, 286], [69, 294], [61, 302],
  [50, 310], [50, 318], [49, 326], [49, 334], [49, 342], [50, 350], [52, 358], [55, 366], [58, 374], [62, 382],
  [67, 390], [72, 398], [79, 406], [87, 414], [96, 422], [104, 430], [111, 438], [100, 446], [121, 454], [147, 462],
  [174, 467], [177, 467], [373, 462], [408, 454], [426, 446], [417, 438], [423, 430], [432, 422], [441, 414], [448, 406],
  [455, 398], [461, 390], [465, 382], [470, 374], [473, 366], [475, 358], [476, 350], [477, 342], [477, 334], [477, 326],
  [477, 318], [477, 310], [465, 302], [457, 294], [453, 286], [451, 278], [451, 270], [451, 262], [452, 254], [453, 246],
  [455, 238], [457, 230], [459, 222], [461, 214], [465, 206], [469, 198], [472, 190], [474, 182], [473, 174], [472, 166],
  [472, 158], [469, 150], [463, 142], [453, 134], [401, 126], [393, 118], [387, 110], [368, 102], [337, 94], [289, 86],
  [281, 78], [267, 70],
];
const GROW = 6;
const MID_X = 263;
const MID_Y = 270;
const artClipPolygon = WINDOW.map(([x, y]) => ({
  x: FRAME.dx + x + Math.sign(x - MID_X) * GROW,
  y: FRAME.dy + y + Math.sign(y - MID_Y) * GROW,
}));

/** The window's middle and the height the art must cover (about 409, grown). */
const WIN_X = FRAME.dx + MID_X;
const WIN_Y = FRAME.dy + 268;
const WIN_H = 412;

/**
 * The square art, scaled so its picture covers the window. Location art is wide,
 * so it comes padded with white bars top and bottom; `cut` is how much of each
 * side is padding (art-crop.json), and the bars are pushed out of the window.
 */
function artCoords(cut: number) {
  const size = Math.max(450, WIN_H / (1 - 2 * Math.min(cut, 0.3)));
  return { dx: WIN_X - size / 2, dy: WIN_Y - size / 2, dWidth: size, dHeight: size };
}

/** Layout values, tuned by eye against HearthstoneJSON's renders of real locations. */
export const LOCATION_LAYOUT = {
  frame: FRAME,
  nameBanner: { dx: 88, dy: 488, sWidth: 490, sHeight: 122, dWidth: 490, dHeight: 122 },
  namePathMiddle: 0.58,
  rarityGem: { dx: 299, dy: 572 },
  body: { dx: 150, dy: 642, dWidth: 352, dHeight: 168, sWidth: 352, sHeight: 168 },
  watermark: { dx: 241, dy: 642, dWidth: 170, dHeight: 170 },
  durabilityGem: { dx: 459, dy: 768, sWidth: 115, sHeight: 135, dWidth: 115, dHeight: 135 },
  durabilityText: { dx: 515, dy: 838 },
  cost: { gem: { dx: 47, dy: 105 }, text: { dx: 115, dy: 174 } },
};

/** Sunwell's card object, loosely: we only set its layout fields. */
type Loose = Record<string, unknown>;

/** Turn Sunwell's hero card into a location: frame, art window and every part moved. */
export function applyLocationLayout(card: object, cut = 0) {
  const c = card as Loose;
  const L = LOCATION_LAYOUT;
  c.baseCardFrameAsset = 'frame-location-';
  c.baseCardFrameCoords = { ...L.frame };
  c.artCoords = artCoords(cut);
  c.artClipPolygon = artClipPolygon;
  c.nameBannerCoords = { ...L.nameBanner };
  // Sunwell puts names a little left of the middle on its hero banner; centre them here.
  c.nameTextCurve = { ...(c.nameTextCurve as object), pathMiddle: L.namePathMiddle };
  c.rarityGemCoords = { ...L.rarityGem };
  c.bodyTextCoords = { ...L.body };
  c.getWatermarkCoords = () => ({ ...L.watermark });
  c.getHealthGemAsset = () => 'armor';
  c.getHealthGemCoords = () => ({ ...L.durabilityGem });
  c.getHealthTextCoords = () => ({ ...L.durabilityText });
  c.getCostGemCoords = () => ({ ...L.cost.gem });
  c.getCostTextCoords = () => ({ ...L.cost.text });
}
