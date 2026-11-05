#!/usr/bin/env python3
"""Build a static, self-hosted ODNR depth-contour map.

Usage: python3 tools/build-odnr-contours.py --lake hoover
       python3 tools/build-odnr-contours.py --lake hoover --download

Only Hoover has written ODNR publication permission. --download refreshes the
retained raw GeoJSON. Without it, rendering is offline and deterministic.
"""
import argparse
import datetime as dt
import json
import math
import pathlib
import urllib.parse
import urllib.request
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
LAKES = {"hoover": "Hoover Reservoir"}
SERVICES = {
    "bathymetry": "https://gis2.ohiodnr.gov/ArcGIS/rest/services/DOW_Services/DOW_Lakes_Bathymetry/MapServer/0/query",
    "lake-background": "https://gis2.ohiodnr.gov/ArcGIS/rest/services/DOW_Services/DOW_LakeFishing/MapServer/20/query",
}
W, H = 800, 1460
NAVY, NAVY_MID, NAVY_LIGHT = "#0a1628", "#122038", "#1a2e4a"
CREAM, CREAM_DARK, AMBER = "#f5edd8", "#e8d5a3", "#f0a830"


def download(lake):
    folder = ROOT / "data" / "odnr" / lake
    folder.mkdir(parents=True, exist_ok=True)
    urls = {}
    for name, service in SERVICES.items():
        query = urllib.parse.urlencode({
            "where": f"upper(LAKE_NAME) = '{LAKES[lake].upper()}'",
            "outFields": "*", "returnGeometry": "true", "outSR": "4326", "f": "geojson",
        })
        url = service + "?" + query
        with urllib.request.urlopen(url, timeout=60) as response:
            raw = response.read()
        data = json.loads(raw)
        if not data.get("features"):
            raise RuntimeError(f"ODNR returned no {name} features for {lake}")
        (folder / f"{name}.geojson").write_bytes(raw)
        urls[name] = url
    metadata = {
        "lake": LAKES[lake],
        "accessed": dt.date.today().isoformat(),
        "sources": urls,
        "depth_units": "feet; 10 ft contour intervals, confirmed by the official Hoover fishing map PDF",
        "fishing_map_pdf": "https://dam.assets.ohio.gov/image/upload/ohiodnr.gov/documents/wildlife/maps/hooverreservoir2.pdf",
        "fishing_map_revision": "2010",
        "reservoir_last_surveyed": "2001",
        "normal_summer_pool_ft": 894,
        "notes": [
            "The ODNR bathymetry service has no survey-date field. Its Hoover DT_ADDED value is June 10, 2014.",
            "The survey and revision years above are printed on the linked official ODNR Hoover fishing map PDF.",
            "Written ODNR permission applies to Hoover only. Never render another lake without its own permission.",
        ],
    }
    (folder / "source.json").write_text(json.dumps(metadata, indent=2) + "\n")
    return metadata


def lines(geometry):
    if geometry["type"] == "LineString":
        return [geometry["coordinates"]]
    if geometry["type"] == "MultiLineString":
        return geometry["coordinates"]
    return []


def rings(geometry):
    if geometry["type"] == "Polygon":
        return geometry["coordinates"]
    if geometry["type"] == "MultiPolygon":
        return [ring for polygon in geometry["coordinates"] for ring in polygon]
    return []


def rdp(points, epsilon):
    if len(points) < 3:
        return points
    ax, ay = points[0]; bx, by = points[-1]
    dx, dy = bx - ax, by - ay
    denom = math.hypot(dx, dy)
    farthest, distance = 0, 0.0
    for i, (x, y) in enumerate(points[1:-1], 1):
        d = abs(dy * x - dx * y + bx * ay - by * ax) / denom if denom else math.hypot(x - ax, y - ay)
        if d > distance:
            farthest, distance = i, d
    if distance <= epsilon:
        return [points[0], points[-1]]
    left = rdp(points[:farthest + 1], epsilon)
    return left[:-1] + rdp(points[farthest:], epsilon)


def interpolate(points, fraction):
    lengths = [math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(points, points[1:])]
    target = sum(lengths) * fraction
    walked = 0.0
    for i, length in enumerate(lengths):
        if walked + length >= target and length:
            t = (target - walked) / length
            a, b = points[i], points[i + 1]
            return a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
        walked += length
    return points[-1]


def render(lake):
    folder = ROOT / "data" / "odnr" / lake
    contour_data = json.loads((folder / "bathymetry.geojson").read_text())
    background_data = json.loads((folder / "lake-background.geojson").read_text())
    contour_paths, depths = [], {}
    for feature in contour_data["features"]:
        # ODNR stores depth as negative values below normal summer pool.
        depth = abs(int(feature["properties"]["DEPTH"]))
        depths[depth] = depths.get(depth, 0) + 1
        for path in lines(feature["geometry"]):
            contour_paths.append((depth, rdp(path, 0.000018)))
    shore_paths = [rdp(path, 0.000012) for f in background_data["features"] for path in rings(f["geometry"])]
    all_points = [p for path in (shore_paths or [p for _, p in contour_paths]) for p in path]
    xmin, xmax = min(p[0] for p in all_points), max(p[0] for p in all_points)
    ymin, ymax = min(p[1] for p in all_points), max(p[1] for p in all_points)
    # Longitude is scaled by latitude so north is up and shapes are not stretched.
    midlat = math.radians((ymin + ymax) / 2)
    aspect = math.cos(midlat)
    left, right, top, bottom = 66, W - 66, 76, H - 76
    sx = (right - left) / ((xmax - xmin) * aspect)
    sy = (bottom - top) / (ymax - ymin)
    scale = min(sx, sy)
    ox = (W - (xmax - xmin) * aspect * scale) / 2
    oy = (H - (ymax - ymin) * scale) / 2

    def point(p):
        return ((p[0] - xmin) * aspect * scale + ox, H - ((p[1] - ymin) * scale + oy))

    def path_d(path):
        pts = [point(p) for p in path]
        return "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts)

    svg = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img">',
        f'<rect width="{W}" height="{H}" fill="{NAVY}"/>',
    ]
    for path in shore_paths:
        svg.append(f'<path d="{path_d(path)} Z" fill="{NAVY_MID}" stroke="{CREAM_DARK}" stroke-width="3"/>')
    for depth, path in contour_paths:
        color = AMBER if depth % 20 == 0 else CREAM
        svg.append(f'<path d="{path_d(path)}" fill="none" stroke="{color}" stroke-opacity="0.76" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>')
    svg += [
        f'<path d="M710 162 L710 90 M710 90 L698 112 M710 90 L722 112" fill="none" stroke="{CREAM}" stroke-width="5" stroke-linecap="square"/>',
        f'<text x="710" y="190" fill="{CREAM}" text-anchor="middle" font-family="monospace" font-size="34" font-weight="bold">N</text>',
        '</svg>',
    ]
    # Labels sit on real contours. Try several positions to avoid collisions.
    fractions = {10: .23, 20: .58, 30: .69, 40: .46, 50: .72, 60: .47}
    labels = []
    occupied = []
    for depth in sorted(depths):
        candidates = [p for d, p in contour_paths if d == depth]
        longest = max(candidates, key=lambda p: len(p))
        preferred = fractions.get(depth, .5)
        offsets = [0, -.1, .1, -.2, .2, -.3, .3, -.4, .4]
        positions = [point(interpolate(longest, min(.95, max(.05, preferred + offset)))) for offset in offsets]
        x, y = next(((x, y) for x, y in positions
                     if 100 < x < W - 100 and 50 < y < H - 50
                     and all(abs(x - ox) > 175 or abs(y - oy) > 62 for ox, oy in occupied)), positions[0])
        occupied.append((x, y))
        labels.append((depth, x, y))
        svg.insert(-1, f'<text x="{x:.1f}" y="{y:.1f}" fill="{CREAM}" stroke="{NAVY}" stroke-width="9" paint-order="stroke" text-anchor="middle" font-family="monospace" font-size="42" font-weight="bold">{depth} ft</text>')
    out = ROOT / "assets" / "maps"
    out.mkdir(parents=True, exist_ok=True)
    (out / f"{lake}-depth-contours.svg").write_text("\n".join(svg) + "\n")

    # A compact fallback for browsers or readers that do not display SVG.
    image = Image.new("RGB", (W, H), NAVY)
    draw = ImageDraw.Draw(image)
    for path in shore_paths:
        draw.polygon([point(p) for p in path], fill=NAVY_MID, outline=CREAM_DARK, width=3)
    for depth, path in contour_paths:
        draw.line([point(p) for p in path], fill=AMBER if depth % 20 == 0 else CREAM, width=3, joint="curve")
    draw.line([(710, 162), (710, 90), (698, 112)], fill=CREAM, width=5)
    draw.line([(710, 90), (722, 112)], fill=CREAM, width=5)
    font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
    font = ImageFont.truetype(font_path, 42)
    small = ImageFont.truetype(font_path, 34)
    draw.text((710, 166), "N", font=small, fill=CREAM, anchor="mt")
    for depth, x, y in labels:
        draw.text((x, y), f"{depth} ft", font=font,
                  fill=CREAM, stroke_width=5, stroke_fill=NAVY, anchor="mm")
    image.save(out / f"{lake}-depth-contours.webp", "WEBP", lossless=True, method=6)
    print(f"{lake}: {len(contour_paths)} simplified contour parts, depths {', '.join(str(d) + ' ft' for d in sorted(depths))}")
    print(f"Wrote {out / (lake + '-depth-contours.svg')} and WebP fallback")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lake", required=True, choices=LAKES)
    parser.add_argument("--download", action="store_true", help="refresh retained raw ODNR GeoJSON before rendering")
    args = parser.parse_args()
    if args.download:
        download(args.lake)
    render(args.lake)


if __name__ == "__main__":
    main()
