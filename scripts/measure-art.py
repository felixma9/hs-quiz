"""Measure the light strips at the edges of each card's art.

Some card art (mostly older cards) is padded with white/light bars. This
downloads the small 256px art for every card in public/cards.json, finds how
far the light edge runs in from each side, and writes the crop each card needs
to public/art-crop.json as {card id: fraction of the width to cut per side}.
Cards already measured are skipped, so rerunning after an update is cheap.

Run: python3 -I scripts/measure-art.py
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
LIGHT = 232  # average brightness of a column/row that counts as padding


def edge(px, w, h, horizontal: bool, from_start: bool) -> int:
    """How many columns (or rows) in from one side are near-white."""
    n = 0
    limit = (w if horizontal else h) // 3
    while n < limit:
        i = n if from_start else (w if horizontal else h) - 1 - n
        line = [px[i, y] for y in range(h)] if horizontal else [px[x, i] for x in range(w)]
        if sum(line) / len(line) < LIGHT:
            break
        n += 1
    return n


def measure(card_id: str) -> tuple[str, float | None]:
    try:
        req = urllib.request.Request(URL.format(card_id), headers={'User-Agent': 'hs-quiz art measure'})
        data = urllib.request.urlopen(req, timeout=20).read()
        im = Image.open(io.BytesIO(data)).convert('L')
    except Exception:
        return card_id, None
    w, h = im.size
    px = im.load()
    sides = [edge(px, w, h, True, True), edge(px, w, h, True, False), edge(px, w, h, False, True), edge(px, w, h, False, False)]
    return card_id, round(max(sides) / w, 3)


def main() -> None:
    cards = json.loads(CARDS.read_text())
    ids = [c['id'] for c in cards]
    known: dict[str, float] = json.loads(OUT.read_text()) if OUT.exists() else {}
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
