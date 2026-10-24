#!/usr/bin/env python3
"""Update data/matches/match-6.json streams from a remote M3U playlist.

The match name is read from match-1.json -> match -> name.
If no matching streams are found, the existing JSON is left unchanged.
"""
import json
import os
import re
import sys
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
JSON_PATH = ROOT / "data" / "matches" / "match-6.json"
PLAYLIST_URL = os.environ.get(
    "SPORTS_M3U_URL",
    "https://raw.githubusercontent.com/sm-monirulislam/Upcoming-and-Live-Sports-Data/main/Sports_data.m3u",
)

def fetch_text(url):
    req = Request(url, headers={"User-Agent": "Nova-Tv-Match-Updater/1.0"})
    with urlopen(req, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")

def norm(text):
    return re.sub(r"[^a-z0-9]+", "", (text or "").lower())

def parse_m3u(text, match_name):
    wanted = norm(match_name)
    entries = []
    current = None
    license_key = ""
    license_type = ""

    def finish(url):
        nonlocal current, license_key, license_type
        if current and url and not url.startswith("#"):
            display = current.get("display", "")
            # Require the match name to occur in the EXTINF display title.
            if wanted and wanted in norm(display):
                drm = None
                if license_key and license_type.lower() == "clearkey":
                    drm = {"scheme": "clearkey", "license": license_key}
                entries.append({
                    "name": display.split(" - ", 1)[1].strip()
                            if " - " in display else display.strip(),
                    "url": url.strip(),
                    **({"drm": drm} if drm else {}),
                    "show": "yes",
                })
        current = None
        license_key = ""
        license_type = ""

    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith("#EXTINF:"):
            # Finish should normally have happened on the prior URL line.
            current = {"display": line.rsplit(",", 1)[-1].strip()}
            license_key = ""
            license_type = ""
        elif line.startswith("#KODIPROP:inputstream.adaptive.license_type="):
            license_type = line.split("=", 1)[1].strip()
        elif line.startswith("#KODIPROP:inputstream.adaptive.license_key="):
            license_key = line.split("=", 1)[1].strip()
        elif line.startswith("#"):
            continue
        else:
            finish(line)

    # Remove duplicate URLs, preserve playlist order.
    unique = []
    seen = set()
    for entry in entries:
        if entry["url"] not in seen:
            seen.add(entry["url"])
            unique.append(entry)
    return unique

def main():
    if not JSON_PATH.exists():
        raise SystemExit(f"Missing match JSON: {JSON_PATH}")
    original = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    match = original.get("match")
    if not isinstance(match, dict) or not match.get("name"):
        raise SystemExit('JSON must contain "match": {"name": "..."}')

    match_name = match["name"]
    playlist = fetch_text(PLAYLIST_URL)
    streams = parse_m3u(playlist, match_name)

    if not streams:
        print(f"No M3U streams matched {match_name!r}; leaving JSON unchanged.")
        return

    # Update only stream data and the primary playback URL/DRM fields.
    match["streams"] = streams
    match["url"] = streams[0]["url"]
    if streams[0].get("drm"):
        match["drm"] = streams[0]["drm"]
    else:
        match.pop("drm", None)

    JSON_PATH.write_text(
        json.dumps(original, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Updated {JSON_PATH.name}: {len(streams)} matching streams for {match_name!r}.")

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
