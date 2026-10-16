"""Draws the Upande GIS app icons: a white map pin at the end of a dashed
walked route, on brand green (#1F6B4A).

    /usr/bin/python3 -I scripts/make-icons.py      (needs Pillow)

Writes assets/images/{icon,android-icon-foreground,android-icon-monochrome,
splash-icon,favicon}.png. Drawn 4x larger and scaled down for smooth edges.
"""
import math
import os

from PIL import Image, ImageDraw

BRAND = (31, 107, 74, 255)
WHITE = (255, 255, 255, 255)
SS = 4  # supersampling
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'images')


def mark(size, scale, colour, hole, route=True, cy_shift=0.0):
    """Pin + route on a transparent canvas. `scale` = mark height / canvas."""
    S = size * SS
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    h = S * scale  # overall mark height
    cx = S / 2 + (h * 0.2 if route else 0)
    top = S / 2 - h / 2 + S * cy_shift
    r = h * 0.27  # pin head radius
    head = (cx, top + r)
    tip = (cx, top + h * 0.78)

    # pin: circle + the two tangents meeting at the tip
    d.ellipse([head[0] - r, head[1] - r, head[0] + r, head[1] + r], fill=colour)
    dist = tip[1] - head[1]
    a = math.acos(r / dist)
    left = (head[0] - r * math.sin(a), head[1] + r * math.cos(a))
    right = (head[0] + r * math.sin(a), head[1] + r * math.cos(a))
    d.polygon([left, right, tip], fill=colour)
    # hole in the head
    hr = r * 0.42
    d.ellipse([head[0] - hr, head[1] - hr, head[0] + hr, head[1] + hr], fill=hole)

    if route:
        # dotted walked route sweeping in from the bottom-left to the pin's tip
        dr = h * 0.045  # dot radius
        p0 = (cx - h * 0.78, tip[1] + h * 0.16)
        p1 = (cx - h * 0.30, tip[1] + h * 0.30)
        p2 = (cx - h * 0.42, tip[1] - h * 0.05)
        p3 = (tip[0] - h * 0.05, tip[1] + h * 0.03)
        curve = []
        for i in range(401):
            t = i / 400
            x = (1 - t) ** 3 * p0[0] + 3 * (1 - t) ** 2 * t * p1[0] + 3 * (1 - t) * t ** 2 * p2[0] + t ** 3 * p3[0]
            y = (1 - t) ** 3 * p0[1] + 3 * (1 - t) ** 2 * t * p1[1] + 3 * (1 - t) * t ** 2 * p2[1] + t ** 3 * p3[1]
            curve.append((x, y))
        length = sum(math.dist(p, q) for p, q in zip(curve, curve[1:]))
        n = 5
        step = (length - h * 0.08) / (n - 1)  # stop just short of the tip
        acc, nxt, k = 0.0, 0.0, 0
        for p, q in zip(curve, curve[1:]):
            if k < n and acc >= nxt:
                rr = dr * (1.45 if k == 0 else 1.0)  # bigger start point
                d.ellipse([p[0] - rr, p[1] - rr, p[0] + rr, p[1] + rr], fill=colour)
                k, nxt = k + 1, nxt + step
            acc += math.dist(p, q)
    return im.resize((size, size), Image.LANCZOS)


def on_background(size, scale, radius=0.0):
    S = size * SS
    bg = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(bg).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * radius), fill=BRAND)
    bg = bg.resize((size, size), Image.LANCZOS)
    bg.alpha_composite(mark(size, scale, WHITE, BRAND, cy_shift=0.03))
    return bg


def main():
    os.makedirs(OUT, exist_ok=True)
    save = lambda im, name: (im.save(os.path.join(OUT, name)), print('wrote', name, im.size))

    # iOS / store icon: full-bleed square (the OS rounds the corners), no transparency.
    save(on_background(1024, 0.56).convert('RGB'), 'icon.png')
    # Android adaptive icon: the mark must sit in the inner ~66% safe zone.
    fg = mark(1024, 0.42, WHITE, (0, 0, 0, 0), cy_shift=0.02)
    save(fg, 'android-icon-foreground.png')
    save(fg, 'android-icon-monochrome.png')  # themed icons use the alpha only
    # Splash: white mark on the green splash background colour.
    save(mark(512, 0.78, WHITE, (0, 0, 0, 0), cy_shift=0.03), 'splash-icon.png')
    # Web favicon: small rounded tile, no route (too fine at 48 px).
    S = 48 * SS
    fav = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(fav).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=BRAND)
    fav = fav.resize((48, 48), Image.LANCZOS)
    fav.alpha_composite(mark(48, 0.72, WHITE, BRAND, route=False, cy_shift=0.12))
    save(fav, 'favicon.png')


if __name__ == '__main__':
    main()
