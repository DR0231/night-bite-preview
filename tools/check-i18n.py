#!/usr/bin/env python3
"""Check the interface string files in data/i18n/ (S9). Static, fast. Run from anywhere:  python3 tools/check-i18n.py

data/i18n/en.json is the source. For every other <lang>.json it reports:
  missing keys (shown in English on the site; a warning, the count per language is printed),
  extra keys not in en.json (error), {placeholders} that don't match English (error),
  protected words changed or dropped (error): ramp names, lake names, agencies, units, weather.gov,
  _meta.review not "draft" until a person has reviewed it ("reviewed" is the only other value),
  and a language file that js/a11y-boot.js doesn't list in LANGS (or the other way round).
Also checks en.json strings hold no lake or ramp names, so facts never enter the translated set.
Exit 1 on any error. NB_ROOT overrides the site folder (live checks read the live checkout).
"""
import json, os, pathlib, re, sys

ROOT = pathlib.Path(os.environ.get("NB_ROOT") or pathlib.Path(__file__).resolve().parent.parent)
D = ROOT / "data" / "i18n"
PROTECTED = ["Whisperwood", "GitHub", "ODNR", "USGS", "NWS", "Columbus", "US\u00a0Army Corps of Engineers", "weather.gov", "The Night Bite", "markdown"]
FACTS = ["Hoover", "Alum", "Buckeye Lake", "Oxbow", "Sunbury Road", "Twin Bridges", "Red Bank", "Walnut Street", "Mudflats",
         "O'Shaughnessy", "Griggs", "ramp", "ft", "\u00b0F", "mph"]
# generic UI labels that say "ramp" as a word, not a ramp name (S10)
GENERIC = {"pg.public_area", "pg.water_lead_b"}
errs, warns, fails = [], [], 0
def ph(s): return sorted(re.findall(r"\{\w+\}", s))
if not (D / "en.json").exists():
    print("FAIL no data/i18n/en.json"); sys.exit(1)
en = json.loads((D / "en.json").read_text())["strings"]
for k, v in en.items():
    for f in FACTS:
        if k in GENERIC and f == "ramp": continue
        if re.search(r"(?<![A-Za-z])" + re.escape(f) + r"(?![A-Za-z])", v):
            errs.append(f"en.json {k}: holds a fact word '{f}' (lake, ramp or unit names stay out of the string files)")
boot = (ROOT / "js" / "a11y-boot.js").read_text()
m = re.search(r"LANGS = \{([^}]*)\}", boot)
listed = set(re.findall(r"(\w[\w-]*):", m.group(1))) if m else set()
files = sorted(p.stem for p in D.glob("*.json"))
for l in sorted(set(files) ^ listed):
    errs.append(f"{l}: " + ("has a string file but is not in LANGS in js/a11y-boot.js" if l in files else "is in LANGS but has no data/i18n/" + l + ".json"))
report = []
for l in files:
    if l == "en": continue
    j = json.loads((D / f"{l}.json").read_text()); tr = j.get("strings", {}); meta = j.get("_meta", {})
    if meta.get("lang") != l: errs.append(f"{l}.json: _meta.lang is {meta.get('lang')!r}")
    if meta.get("review") not in ("draft", "reviewed"): errs.append(f"{l}.json: _meta.review must be 'draft' (or 'reviewed' after a person checks it)")
    if not meta.get("name"): errs.append(f"{l}.json: _meta.name (the language's own name) missing")
    miss = [k for k in en if k not in tr]; extra = [k for k in tr if k not in en]
    for k in extra: errs.append(f"{l}.json: extra key {k}")
    for k in en:
        if k not in tr: continue
        if ph(en[k]) != ph(tr[k]): errs.append(f"{l}.json {k}: placeholders {ph(tr[k])} != English {ph(en[k])}")
        for w in PROTECTED:
            if w in en[k] and w not in tr[k]: errs.append(f"{l}.json {k}: protected '{w}' changed or dropped")
        if not tr[k].strip(): errs.append(f"{l}.json {k}: empty")
    if "i18n.draft" not in tr: errs.append(f"{l}.json: no i18n.draft (the Draft translation marker)")
    report.append(f"{l} ({meta.get('name')}, {meta.get('review')}): {len(en) - len(miss)}/{len(en)} keys, {len(miss)} missing" + (": " + ", ".join(miss[:12]) if miss else ""))
print(f"check-i18n: {len(en)} English keys, languages {', '.join(files)}")
for r in report: print("  " + r)
for e in errs: print("FAIL " + e)
print(f"check-i18n: {len(errs)} errors")
sys.exit(1 if errs else 0)
