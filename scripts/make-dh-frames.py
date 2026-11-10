"""Make Demon Hunter frames by recoloring another class frame to fel green.

Sunwell has no Demon Hunter frames. Only cool hues (runes, frame color) are
shifted, so the metal, parchment and wood stay as they are. The shipped frames
were made with:

  for t in minion spell weapon; do
    python3 -I scripts/make-dh-frames.py public/sunwell/frame-$t-deathknight.webp public/sunwell/frame-$t-demonhunter.webp -55 1.6 1.0
  done
  python3 -I scripts/make-dh-frames.py public/sunwell/frame-hero-warlock.webp public/sunwell/frame-hero-demonhunter.webp -110 1.1 0.55

Sunwell has no Death Knight hero frame either; that one was made the same way:

  python3 -I scripts/make-dh-frames.py public/sunwell/frame-hero-warlock.webp public/sunwell/frame-hero-deathknight.webp -70 0.5 0.75

Args: source, output, hue shift (0-255 scale), saturation gain, brightness factor.
"""
import sys
from PIL import Image

def recolor(src, dst, shift, sat_gain, dark):
    im = Image.open(src).convert('RGBA')
    alpha = im.getchannel('A')
    h, s, v = im.convert('RGB').convert('HSV').split()
    H, Sd, V = list(h.getdata()), list(s.getdata()), list(v.getdata())
    for i, sat in enumerate(Sd):
        if sat > 40 and H[i] >= 100:  # cool-colored parts only; metal, parchment, wood stay
            H[i] = (H[i] + shift) % 256
            Sd[i] = min(255, int(sat * sat_gain))
            V[i] = min(255, int(V[i] * dark))
    h.putdata(H); s.putdata(Sd); v.putdata(V)
    out = Image.merge('HSV', (h, s, v)).convert('RGB')
    out.putalpha(alpha)
    out.save(dst, 'WEBP', quality=88, method=6)

src, dst, shift, gain, dark = sys.argv[1], sys.argv[2], int(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5])
recolor(src, dst, shift, gain, dark)
