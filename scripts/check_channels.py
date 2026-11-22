#!/usr/bin/env python3
"""Check public stream manifests referenced by Nova-Tv data/*.json.
RUNNING means the manifest endpoint responded and looked like HLS/DASH;
it does not guarantee DRM/license or device playback will work.
"""
import json, os, re, time
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse
import requests

OWNER = "Adnanakhim98"
REPO = "Nova-Tv"
BRANCH = "main"
DATA_FILES = [
    "bangla.json", "cartoon.json", "documentary.json", "entertainment.json",
    "india.json", "live-sports.json", "movie.json", "music.json",
    "news.json", "religion.json", "sports.json", "willow.json",
    "teams.json", "team-registry.json",
]
ROOT = f"https://raw.githubusercontent.com/{OWNER}/{REPO}/{BRANCH}/data/"
TIMEOUT = 15
HEADERS = {"User-Agent": "SPORTYNOVA-Channel-Status/1.0", "Accept": "*/*"}

def classify_format(url):
    path = urlparse(url).path.lower()
    if ".m3u8" in path: return "M3U8"
    if ".mpd" in path: return "MPD"
    return "OTHER"

def get_stream_urls(ch):
    out = []
    def add(value, label="Primary"):
        if isinstance(value, str) and value.strip().startswith(("http://", "https://")):
            pair = (label, value.strip())
            if pair not in out: out.append(pair)
    add(ch.get("url"), "Primary")
    streams = ch.get("streams")
    if isinstance(streams, list):
        for s in streams:
            if isinstance(s, dict): add(s.get("url"), s.get("name") or "Server")
    return out

def inspect_url(url):
    fmt = classify_format(url)
    try:
        r = requests.get(url, headers=HEADERS, timeout=TIMEOUT, allow_redirects=True, stream=True)
        code = r.status_code
        # Read a small prefix; avoid downloading the full live playlist/manifest.
        prefix = next(r.iter_content(chunk_size=4096), b"")
        r.close()
        text = prefix.decode("utf-8", "ignore").lstrip("\ufeff \r\n\t").lower()
        if code in (404, 410):
            return "DEACTIVATED", code, f"Endpoint returned HTTP {code}"
        if code in (401, 403):
            return "UNKNOWN", code, f"Access restricted (HTTP {code}); may require headers, token or region access"
        if code >= 500:
            return "UNKNOWN", code, f"Server error HTTP {code}"
        if not 200 <= code < 300:
            return "UNKNOWN", code, f"Unexpected HTTP {code}"
        if fmt == "M3U8":
            if "#extm3u" in text:
                return "RUNNING", code, "HLS manifest reachable (playback not guaranteed)"
            return "UNKNOWN", code, "HTTP responded, but content does not look like an HLS playlist"
        if fmt == "MPD":
            if "<mpd" in text or "<?xml" in text and "mpd" in text:
                return "RUNNING", code, "DASH manifest reachable (DRM/playback not verified)"
            return "UNKNOWN", code, "HTTP responded, but content does not look like a DASH MPD"
        return "UNKNOWN", code, "URL extension is not .m3u8 or .mpd"
    except requests.exceptions.Timeout:
        return "UNKNOWN", None, "Request timed out"
    except requests.exceptions.RequestException as e:
        return "UNKNOWN", None, f"Network/request error: {str(e)[:180]}"

def main():
    session = requests.Session()
    records = []
    for filename in DATA_FILES:
        try:
            response = session.get(ROOT + filename, headers=HEADERS, timeout=TIMEOUT)
            if response.status_code == 404:
                continue
            response.raise_for_status()
            payload = response.json()
        except Exception as e:
            print(f"Skip {filename}: {e}")
            continue
        channels = payload.get("channels", []) if isinstance(payload, dict) else payload if isinstance(payload, list) else []
        for idx, ch in enumerate(channels):
            if not isinstance(ch, dict): continue
            name = str(ch.get("name") or f"Unnamed channel #{idx+1}")
            urls = get_stream_urls(ch)
            base = {"name": name, "category": ch.get("category", ""),
                    "source_file": filename, "checked_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
            if not urls:
                records.append({**base, "format":"OTHER", "status":"UNKNOWN",
                                "http_status":None, "message":"No valid primary or alternate stream URL found"})
                continue
            checks = []
            for label, url in urls:
                status, code, message = inspect_url(url)
                checks.append((status, code, message, label, url))
                if status == "RUNNING": break
            chosen = next((x for x in checks if x[0] == "RUNNING"), checks[0])
            status, code, message, label, url = chosen
            if status != "RUNNING" and any(x[0] == "UNKNOWN" for x in checks):
                status = "UNKNOWN"
                message = "No server confirmed online; one or more checks were inconclusive. " + message
            records.append({**base, "format":classify_format(url), "status":status,
                            "http_status":code, "server":label, "message":message})
    output = {"updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
              "repository": f"{OWNER}/{REPO}", "channels": records,
              "note": "RUNNING confirms manifest reachability only; it does not verify DRM, license keys, geo access or playback on every device."}
    os.makedirs("status", exist_ok=True)
    with open("status/channel-status.json", "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"Wrote status for {len(records)} channel entries")

if __name__ == "__main__":
    main()
