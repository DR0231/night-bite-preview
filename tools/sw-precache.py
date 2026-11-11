#!/usr/bin/env python3
"""Write the content hash of every sw.js PRECACHE file into sw.js REVISIONS, so an installed phone only
downloads the files that changed since its last worker (instead of all of them on every VERSION).

    python3 tools/sw-precache.py            # rewrite REVISIONS (stamp-version.py and promote.py run this)
    python3 tools/sw-precache.py --check    # change nothing; exit 1 if REVISIONS is stale or a file is missing

Hash: sha256 of the file's bytes, first 12 hex. For HTML (./, a folder/ or *.html) the ?v= stamps are blanked
first, because stamp-version.py rewrites them on every deploy without changing the page. sw.js computes the same
hash when it reuses an older worker's copy, so keep the two in step (isHtmlPath and hashOf in sw.js).
Run it last, after every build that touches a precached file (stamp-version.py, build-updates.py, ...).
"""
import hashlib, json, os, pathlib, re, sys

# NB_ROOT=<dir> checks another copy of the site (tools/check-all.py uses it for the live checkout)
root = pathlib.Path(os.environ.get("NB_ROOT") or pathlib.Path(__file__).resolve().parent.parent)
STAMP = re.compile(r"""\?v=[^"'<>&#) \t\n\r\f]*""")
BLOCK = re.compile(r"(// BEGIN REVISIONS\n)var REVISIONS = \{.*?\};\n(// END REVISIONS)", re.S)


def file_for(path):
    if path == "./":
        return root / "index.html"
    if path.endswith("/"):
        return root / path / "index.html"
    return root / path


def is_html(path):
    return path == "./" or path.endswith("/") or path.lower().endswith(".html")


def rev(path):
    data = file_for(path).read_bytes()
    if is_html(path):
        data = STAMP.sub("?v=", data.decode("utf-8")).encode("utf-8")
    return hashlib.sha256(data).hexdigest()[:12]


def build(write=True):
    sw = root / "sw.js"
    text = sw.read_text(encoding="utf-8")
    m = re.search(r"var PRECACHE = \[\n(.*?)\n\];", text, re.S)
    if not m or not BLOCK.search(text):
        if not write and os.environ.get("NB_ROOT") and m and "REVISIONS" not in text:
            print(f"PASS {root}/sw.js has no REVISIONS yet (a worker from before v127): nothing to check")
            sys.exit(0)
        print("FAIL sw.js: PRECACHE or the REVISIONS block not found")
        sys.exit(1)
    paths = re.findall(r'^\s*"([^"]+)",?\s*$', m.group(1), re.M)
    missing = [p for p in paths if not file_for(p).is_file()]
    if missing:
        print("FAIL precached file(s) missing, so every install would fail: " + ", ".join(missing))
        sys.exit(1)
    revs = {p: rev(p) for p in paths}
    body = "var REVISIONS = {\n" + ",\n".join(f"  {json.dumps(p)}: {json.dumps(r)}" for p, r in revs.items()) + "\n};\n"
    new = BLOCK.sub(lambda x: x.group(1) + body + x.group(2), text, count=1)
    changed = new != text
    if changed and write:
        sw.write_text(new, encoding="utf-8")
    size = sum(file_for(p).stat().st_size for p in paths)
    return changed, len(paths), size


if __name__ == "__main__":
    check = "--check" in sys.argv[1:]
    changed, n, size = build(write=not check)
    if check:
        if changed:
            print(f"FAIL sw.js REVISIONS is stale: run python3 tools/sw-precache.py ({n} files)")
            sys.exit(1)
        print(f"PASS sw.js REVISIONS match {n} precached files ({size / 1e6:.2f} MB)")
    else:
        print(f"sw-precache: {'updated' if changed else 'unchanged'}, {n} files, {size / 1e6:.2f} MB")
