#!/usr/bin/env python3
"""Update matching streams for data/matches/match-1.json through match-10.json."""
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MATCH_DIR = ROOT / "data" / "matches"
PLAYLIST_URL = os.environ.get(
    "SPORTS_M3U_URL",
    "https://raw.githubusercontent.com/sm-monirulislam/Upcoming-and-Live-Sports-Data/main/Sports_data.m3u",
)


def norm(value):
    value = str(value or "").casefold().replace("&", " and ")
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return " ".join(value.split())


def fetch_playlist(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Nova-Tv-Match-Updater/2.0"})
    with urllib.request.urlopen(req, timeout=45) as response:
        return response.read().decode("utf-8-sig", errors="replace")


def parse_playlist(text):
    entries, current = [], None
    drm_scheme, drm_key = None, None

    def flush():
        nonlocal current, drm_scheme, drm_key
        if current and current.get("url"):
            if drm_scheme and drm_key:
                scheme = drm_scheme.casefold()
                current["drm"] = {"scheme": "clearkey" if "clearkey" in scheme else scheme, "license": drm_key}
            entries.append(current)
        current, drm_scheme, drm_key = None, None, None

    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith("#EXTINF:"):
            flush()
            title = line.rsplit(",", 1)[-1].strip() if "," in line else "Stream"
            logo_match = re.search(r'tvg-logo=["\']([^"\']*)["\']', line, re.I)
            current = {"name": title}
            if logo_match:
                current["logoUrl"] = logo_match.group(1)
        elif line.startswith("#KODIPROP:"):
            prop = line[len("#KODIPROP:"):]
            if "=" in prop:
                key, value = prop.split("=", 1)
                key, value = key.strip().casefold(), value.strip()
                if key.endswith("license_type"):
                    drm_scheme = value
                elif key.endswith("license_key"):
                    drm_key = value
        elif line.startswith("#"):
            continue
        elif current:
            if line.startswith("http://") or line.startswith("https://"):
                if "|" in line:
                    url, options = line.split("|", 1)
                    current["url"] = url.strip()
                    # Convert common URL-suffixed ClearKey options to the site's DRM shape.
                    params = dict(part.split("=", 1) for part in options.split("&") if "=" in part)
                    if params.get("drmScheme", "").casefold() == "clearkey" and params.get("drmLicense"):
                        current["drm"] = {"scheme": "clearkey", "license": params["drmLicense"]}
                    current["options"] = options.strip()
                else:
                    current["url"] = line
                flush()
    flush()
    return entries


def stream_matches(title, match_name):
    title_n, match_n = norm(title), norm(match_name)
    if not title_n or not match_n:
        return False
    # Match if either normalized title contains the full configured match name,
    # or all significant name tokens appear in the playlist title.
    if match_n in title_n:
        return True
    tokens = [t for t in match_n.split() if len(t) > 1 and t not in {"vs", "v", "the", "women", "men"}]
    return len(tokens) >= 2 and all(token in title_n.split() for token in tokens)


def update_one(path, entries):
    if not path.exists():
        print(f"SKIP {path.relative_to(ROOT)}: file not found")
        return False
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"ERROR {path.relative_to(ROOT)}: invalid JSON: {exc}")
        return False
    match = data.get("match")
    if not isinstance(match, dict):
        print(f"SKIP {path.relative_to(ROOT)}: expected top-level 'match' object")
        return False
    match_name = str(match.get("name") or "").strip()
    if not match_name:
        print(f"SKIP {path.relative_to(ROOT)}: match.name is empty")
        return False

    found = [item for item in entries if stream_matches(item.get("name", ""), match_name)]
    if not found:
        print(f"NO MATCH {path.relative_to(ROOT)}: no playlist entries matched '{match_name}'; JSON unchanged")
        return False

    old_streams = match.get("streams", [])
    old_by_name = {
        norm(s.get("name", "")): s
        for s in old_streams
        if isinstance(s, dict) and s.get("name")
    } if isinstance(old_streams, list) else {}

    streams = []
    for item in found:
        previous = old_by_name.get(norm(item["name"]), {})
        # Freshly discovered source streams are visible by default; preserve explicit
        # per-stream UI preferences only for streams that already existed by name.
        stream = {"name": item["name"], "url": item["url"], "show": "yes"}
        if item.get("drm"):
            stream["drm"] = item["drm"]
        if item.get("options"):
            stream["options"] = item["options"]
        if item.get("logoUrl"):
            stream["logoUrl"] = item["logoUrl"]
        if previous:
            for key in ("tone", "logo", "fallbackLogo", "show", "Show"):
                if key in previous:
                    stream[key] = previous[key]
        streams.append(stream)

    match["streams"] = streams
    match["url"] = streams[0]["url"]
    if streams[0].get("drm"):
        match["drm"] = streams[0]["drm"]
    else:
        match.pop("drm", None)
    data["_autoUpdate"] = {
        "source": PLAYLIST_URL,
        "matchName": match_name,
        "streamCount": len(streams),
        "updatedAtUTC": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"UPDATED {path.relative_to(ROOT)}: {len(streams)} stream(s) for '{match_name}'")
    return True


def main():
    if not MATCH_DIR.exists():
        raise SystemExit(f"ERROR: match directory not found: {MATCH_DIR}")
    playlist = fetch_playlist(PLAYLIST_URL)
    entries = parse_playlist(playlist)
    if not entries:
        raise SystemExit("ERROR: playlist downloaded, but no stream entries were parsed")
    print(f"Loaded {len(entries)} stream entries from playlist")
    changed = 0
    for number in range(1, 11):
        if update_one(MATCH_DIR / f"match-{number}.json", entries):
            changed += 1
    print(f"Finished. Updated {changed} match JSON file(s).")

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
