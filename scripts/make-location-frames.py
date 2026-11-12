"""Make the location frames (public/sunwell/frame-location-<class>.webp).

Sunwell is older than locations. The frames come from the Hearthstone wiki
(hearthstone.wiki.gg, File:Location-<Class>-rarity.png, 1024 x 1024; the
"rarity" ones have the socket for the rarity gem). Download them into a folder
of their own, then:

  python3 -I scripts/make-location-frames.py <that folder>

Each frame is cropped to the frame itself and scaled to Sunwell's card size
(551 x 800 in its 670 x 1000 space). The wiki's frames have a few opaque white
pixels inside the art window's crest; those are made transparent so the art
shows through. There's no Neutral frame, so it's the Mage frame with its blue
turned grey. It also prints the art window's outline for src/card/location.ts.
"""
import colorsys
import os
import sys

from PIL import Image

SRC = sys.argv[1]
OUT = 'public/sunwell/'
BBOX = (172, 15, 852, 1002)
W, H = 551, 800
CLASSES = {
    'DH': 'demonhunter', 'DK': 'deathknight', 'Druid': 'druid', 'Hunter': 'hunter', 'Mage': 'mage', 'Paladin': 'paladin',
    'Priest': 'priest', 'Rogue': 'rogue', 'Shaman': 'shaman', 'Warlock': 'warlock', 'Warrior': 'warrior',
}


def window(im):
    """The art window: transparent or near-white pixels connected to its middle."""
    px = im.load()
    seen = set()
    stack = [(W // 2, int(H * 0.25))]
    while stack:
        x, y = stack.pop()
        if (x, y) in seen or not (0 <= x < W and 0 <= y < H):
            continue
        r, g, b, a = px[x, y]
        if a > 40 and min(r, g, b) < 225:
            continue
        seen.add((x, y))
        stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    return seen


def load(name):
    im = Image.open(os.path.join(SRC, f'Location-{name}-rarity.png')).convert('RGBA').crop(BBOX).resize((W, H), Image.LANCZOS)
    px = im.load()
    for x, y in window(im):
        px[x, y] = (0, 0, 0, 0)
    return im


def neutral(im):
    """The Mage frame's blue, turned the stone grey of neutral cards."""
    px = im.load()
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            if not a:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if 0.52 < h < 0.75 and s > 0.18:
                k = min(1.0, (s - 0.18) / 0.15)  # fade in at the edges of the blue
                grey = v * 0.92
                mix = [c / 255 * (1 - k) + grey * k for c in (r, g, b)]
                px[x, y] = (min(255, int(mix[0] * 255 * 1.03)), int(mix[1] * 255), int(mix[2] * 255 * 0.94), a)
    return im


for src, name in CLASSES.items():
    load(src).save(f'{OUT}frame-location-{name}.webp', quality=88, method=6)
neutral(load('Mage')).save(f'{OUT}frame-location-neutral.webp', quality=88, method=6)

# The window's outline, every 8 rows: left edge down, right edge back up.
im = load('Mage')
win = window(im)
rows = sorted({y for _, y in win})
left, right = [], []
for y in rows[::8] + [rows[-1]]:
    xs = [x for x, yy in win if yy == y]
    left.append((min(xs), y))
    right.append((max(xs), y))
print('WINDOW =', [list(p) for p in left + right[::-1]])
