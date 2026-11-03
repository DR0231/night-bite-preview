#!/usr/bin/env python3
"""Picker tile charts: assets/tiles/<id>.png, made from each lake's pool card chart (assets/<id>-chart.png).

The pool card charts carry a small north arrow, and some are drawn with north to the left so a long lake fits the
card. The picker on the site root shows every water side by side, so its tiles use a copy with the arrow taken out
and north turned to the top on every water (map convention, so no arrow is needed). The pool card art is unchanged.

    python3 tools/build-tile-charts.py          # writes only the tiles whose bytes would change
Needs Pillow. Run it after adding or redrawing a chart; tools/build-lake-pages.py uses the tile when it exists.
"""
import io
import pathlib
import re
import sys

from PIL import Image

root = pathlib.Path(__file__).resolve().parent.parent
CREAM = (232, 213, 163, 255)
# the arrow and N, as drawn in the top left corner of every chart (pixel positions, 1x)
NORTH_LEFT = {(2, 4), (3, 3), (3, 4), (3, 5), (4, 2), (4, 3), (4, 4), (4, 5), (4, 6), (5, 4), (6, 4), (8, 2), (8, 3),
              (8, 4), (8, 5), (8, 6), (9, 3), (10, 4), (11, 2), (11, 3), (11, 4), (11, 5), (11, 6)}
NORTH_UP = {(2, 3), (3, 2), (3, 3), (3, 4), (3, 5), (3, 6), (4, 3), (6, 2), (6, 3), (6, 4), (6, 5), (6, 6), (7, 3), (8, 4),
            (9, 2), (9, 3), (9, 4), (9, 5), (9, 6)}


def ids():
    src = (root / "js" / "lakes.js").read_text(encoding="utf-8")
    return list(dict.fromkeys(re.findall(r'^\s{4}([a-z]+): \{', src, re.M)))


def tile(src):
    im = Image.open(src).convert("RGBA")
    px = im.load()
    cream = {(x, y) for y in range(min(9, im.height)) for x in range(min(13, im.width)) if px[x, y] == CREAM}
    if NORTH_LEFT <= cream:
        glyph, turn = NORTH_LEFT, True
    elif NORTH_UP <= cream:
        glyph, turn = NORTH_UP, False
    else:
        sys.exit(f"build-tile-charts: no north arrow found in {src.name}; check the chart's top left corner")
    for x, y in glyph:
        px[x, y] = (0, 0, 0, 0)   # the tile's well is navy, so the arrow's navy outline disappears with it
    if turn:
        im = im.rotate(-90, expand=True)   # north on the left -> north at the top
    out = io.BytesIO()
    im.save(out, "PNG", optimize=True)
    return out.getvalue()


def main():
    (root / "assets" / "tiles").mkdir(exist_ok=True)
    n = 0
    for lid in ids():
        src = root / "assets" / f"{lid}-chart.png"
        if not src.exists():
            continue
        dst = root / "assets" / "tiles" / f"{lid}.png"
        data = tile(src)
        if not dst.exists() or dst.read_bytes() != data:
            dst.write_bytes(data)
            n += 1
    print(f"build-tile-charts: {n} tile charts written")


if __name__ == "__main__":
    main()
