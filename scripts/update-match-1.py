#!/usr/bin/env python3
"""Refresh data/matches/match-1.json from the configured sports M3U playlist.

The match name in match-1.json is the source of truth. Only streams whose M3U
EXTINF title contains that complete normalized match name are included. If no
matching stream exists, exit non-zero and leave the JSON untouched so GitHub
Actions cannot report a false successful update.
"""
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
JSON_PATH = ROOT / "data" / "matches" / "match-1.json"
PLAYLIST_URL = os.environ.get(
    "SPORTS_M3U_URL",
    "https://raw.githubusercontent.com/sm-monirulislam/Upcoming-and-Live-Sports-Data/main/Sports_data.m3u",
)


def fetch_text(url):
    # Avoid intermediary caches returning an older copy of the playlist.
    separator = "&" if "?" in url else "?"
    fresh_url = f"{url}{separator}_refresh={int(time.time())}"
    req = Request(
        fresh_url,
        headers={
            "User-Agent": "Nova-Tv-Match-Updater/2.0",
            "Cache-Control": "no-cache, no-store, max-age=0",
            "Pragma": "no-cache",
        },
    )
    with urlopen(req, timeout=45) as response:
        text = response.read().decode("utf-8-sig", errors="replace")
    if "#EXTM3U" not in text[:500]:
        raise ValueError("The URL did not return a valid M3U playlist (missing #EXTM3U header).")
    return text


def norm(value):
    return re.sub(r"[^a-z0-9]+", "", str(value or "").lower())


def parse_m3u(text, match_name):
    wanted = norm(match_name)
    if not wanted:
        raise ValueError("The match name is empty after normalization.")

    entries = []
    current = None
    license_key = ""
    license_type = ""
    available_titles = []

    def finish(url):
        nonlocal current, license_key, license_type
        if current:
            display = current.get("display", "").strip()
            if display:
                available_titles.append(display)
            if url and not url.startswith("#") and wanted in norm(display):
                # Keep the provider/server label but remove the repeated match title.
                display_name = display
                comma_name = display.rsplit(",", 1)[-1].strip()
                if " - " in comma_name:
                    server_name = comma_name.split(" - ", 1)[1].strip()
                else:
                    server_name = comma_name
                item = {"name": server_name or display, "url": url.strip(), "show": "yes"}
                if license_key and license_type.lower() == "clearkey":
                    item["drm"] = {"scheme": "clearkey", "license": license_key}
                entries.append(item)
        current = None
        license_key = ""
        license_type = ""

    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith("#EXTINF:"):
            # Flush a malformed/incomplete previous entry before starting another.
            finish("")
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

    # De-duplicate URLs while preserving playlist order.
    unique = []
    seen_urls = set()
    for entry in entries:
        if entry["url"] not in seen_urls:
            seen_urls.add(entry["url"])
            unique.append(entry)
    return unique, available_titles


def main():
    if not JSON_PATH.exists():
        raise FileNotFoundError(f"Missing match JSON: {JSON_PATH}")

    original = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    match = original.get("match")
    if not isinstance(match, dict) or not isinstance(match.get("name"), str) or not match["name"].strip():
        raise ValueError('JSON must contain a non-empty "match.name" field.')

    match_name = match["name"].strip()
    playlist = fetch_text(PLAYLIST_URL)
    streams, titles = parse_m3u(playlist, match_name)

    if not streams:
        # Fail the workflow visibly, but never destroy the last known JSON streams.
        relevant = [title for title in dict.fromkeys(titles) if any(
            token in norm(title) for token in norm(match_name).split() if len(token) > 3
        )]
        examples = "\n".join(f"  - {title}" for title in (relevant[:8] or list(dict.fromkeys(titles))[:8]))
        message = (
            f"ERROR: no M3U streams matched {match_name!r}. Existing JSON was left unchanged.\n"
            "Check that match.name exactly corresponds to a match title in Sports_data.m3u."
        )
        if examples:
            message += "\nSample playlist titles:\n" + examples
        raise SystemExit(message)

    # Preserve existing per-server visibility preferences when the URL is unchanged.
    old_streams = match.get("streams", [])
    old_by_url = {
        item.get("url"): item
        for item in old_streams
        if isinstance(item, dict) and item.get("url")
    } if isinstance(old_streams, list) else {}
    for stream in streams:
        old = old_by_url.get(stream["url"])
        if old and old.get("show") in ("yes", "no"):
            stream["show"] = old["show"]

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
    print(f"SUCCESS: {len(streams)} matching streams saved for {match_name!r} in {JSON_PATH.relative_to(ROOT)}.")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
