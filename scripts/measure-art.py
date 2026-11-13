"""Measure the padding bars at the edges of each card's art.

A lot of card art is padded with flat bars: white, grey or black. This
downloads the small 256px art for every card in public/cards.json, finds how
far a flat edge (a column or row that is nearly one colour end to end) runs in
from each side, and writes the crop each card needs to public/art-crop.json as
{card id: fraction of the width to cut per side}. Cards already measured are
skipped, so rerunning after an update is cheap; --all measures every card again.

Run: python3 -I scripts/measure-art.py [--all]
"""
import io
import json
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CARDS = ROOT / 'public' / 'cards.json'
OUT = ROOT / 'public' / 'art-crop.json'
URL = 'https://art.hearthstonejson.com/v1/256x/{}.jpg'
# A line counts as padding when it is nearly one colour: at least SHARE of its
# pixels are within NEAR of its median brightness. (Not all of them: a padding
# bar often has a few pixels of art or JPEG noise poking into it.)
NEAR = 14
SHARE = 0.92


def flat(line) -> bool:
    m = sorted(line)[len(line) // 2]
    return sum(abs(v - m) <= NEAR for v in line) >= SHARE * len(line)


def edge(px, w, h, horizontal: bool, from_start: bool) -> int:
    """How many columns (or rows) in from one side are flat padding."""
    n = 0
    limit = (w if horizontal else h) // 3
    while n < limit:
        i = n if from_start else (w if horizontal else h) - 1 - n
        line = [px[i, y] for y in range(h)] if horizontal else [px[x, i] for x in range(w)]
        if not flat(line):
            break
        n += 1
    return n


# How the icons zoom (src/modes/hsdle/Art.tsx): a cut of c per side shows the
# art at MARGIN / (1 - 2c), a card with no cut at NO_CUT_ZOOM. Keep in step.
MARGIN = 1.06
NO_CUT_ZOOM = 1.08
# The icon is a squircle (rounded square, corner radius 30% of its side).
RADIUS = 0.3
# Some padding isn't a straight bar (tilted art leaves white wedges, a corner
# can be white): after the bar crop, zoom in further while more than
# WHITE_SHARE of the icon's outline is padding white, by STEP, up to MAX_CUT.
# Padding white is bright and neutral (channels within NEUTRAL of each other);
# glows and snow in the art are tinted, so they don't count.
WHITE = 232
NEUTRAL = 10
# How close a pixel must be to the art's own padding colour (see padding_colour) to count as padding.
PAD_NEAR = 8
WHITE_SHARE = 0.01
STEP = 0.005
MAX_CUT = 0.18


def zoom(cut: float) -> float:
    return MARGIN / (1 - 2 * cut) if cut else NO_CUT_ZOOM


def outline(n: int = 240) -> list[tuple[float, float]]:
    """Points just inside the squircle's edge, in icon coordinates (0..1)."""
    inset, r = 0.005, RADIUS
    lo, hi = inset, 1 - inset
    pts = []
    for k in range(n):
        t = k / n * 4
        side, f = int(t), t - int(t)
        # Walk each side; near a corner, pull the point onto the rounded corner.
        x, y = [(lo + f * (hi - lo), lo), (hi, lo + f * (hi - lo)), (hi - f * (hi - lo), hi), (lo, hi - f * (hi - lo))][side]
        cx, cy = min(max(x, lo + r), hi - r), min(max(y, lo + r), hi - r)
        dx, dy = x - cx, y - cy
        d = (dx * dx + dy * dy) ** 0.5
        if d > r:
            x, y = cx + dx / d * r, cy + dy / d * r
        pts.append((x, y))
    return pts


OUTLINE = outline()


def padding_colour(rgb, w: int, h: int):
    """The art's own padding colour, if it has one: all four corner pixels the same flat neutral shade
    (some art is cross-shaped, with grey blocks in the corners rather than white bars)."""
    corners = [rgb[1, 1], rgb[w - 2, 1], rgb[1, h - 2], rgb[w - 2, h - 2]]
    first = corners[0]
    if max(first) - min(first) >= NEUTRAL or min(first) < 120:
        return None
    if any(max(abs(c[i] - first[i]) for i in range(3)) > PAD_NEAR for c in corners):
        return None
    return first


def white_share(rgb, w: int, h: int, cut: float, pad=None) -> float:
    s = zoom(cut)
    white = 0
    for x, y in OUTLINE:
        px = rgb[min(w - 1, int((0.5 + (x - 0.5) / s) * w)), min(h - 1, int((0.5 + (y - 0.5) / s) * h))]
        white += (min(px) > WHITE and max(px) - min(px) < NEUTRAL) or (pad is not None and max(abs(px[i] - pad[i]) for i in range(3)) <= PAD_NEAR)
    return white / len(OUTLINE)


def measure(card_id: str) -> tuple[str, float | None]:
    # A Legacy reprint (LEG_) has no art of its own; the original's is the same.
    try:
        req = urllib.request.Request(URL.format(card_id.removeprefix('LEG_')), headers={'User-Agent': 'hs-quiz art measure'})
        data = urllib.request.urlopen(req, timeout=20).read()
        im = Image.open(io.BytesIO(data)).convert('RGB')
    except Exception:
        return card_id, None
    w, h = im.size
    grey = im.convert('L').load()
    sides = [edge(grey, w, h, True, True), edge(grey, w, h, True, False), edge(grey, w, h, False, True), edge(grey, w, h, False, False)]
    cut = max(sides) / w
    rgb = im.load()
    pad = padding_colour(rgb, w, h)
    while cut < MAX_CUT and white_share(rgb, w, h, cut, pad) > WHITE_SHARE:
        cut = max(cut, 0.03) + STEP if cut else 0.03
    return card_id, round(min(cut, MAX_CUT), 3)


def main() -> None:
    cards = json.loads(CARDS.read_text())
    ids = [c['id'] for c in cards]
    fresh = '--all' in sys.argv[1:]
    known: dict[str, float] = {} if fresh or not OUT.exists() else json.loads(OUT.read_text())
    todo = [i for i in ids if i not in known and f'!{i}' not in known]
    print(f'{len(ids)} cards, {len(todo)} to measure', flush=True)
    done = 0
    with ThreadPoolExecutor(max_workers=8) as pool:
        for card_id, crop in pool.map(measure, todo):
            done += 1
            if crop is None:
                continue
            known[card_id] = crop
            if done % 500 == 0:
                print(f'  {done}/{len(todo)}', flush=True)
    # Keep only cards that need cropping (plus a marker for measured-but-clean ones,
    # so they aren't fetched again).
    out = {k: v for k, v in sorted(known.items()) if v >= 0.01 or k.startswith('!')}
    for k, v in known.items():
        if not k.startswith('!') and v < 0.01:
            out[f'!{k}'] = 0
    OUT.write_text(json.dumps(out, separators=(',', ':')))
    padded = sum(1 for k, v in out.items() if not k.startswith('!'))
    print(f'wrote {OUT.name}: {padded} cards need cropping', flush=True)


if __name__ == '__main__':
    sys.exit(main())
