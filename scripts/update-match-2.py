
import json
import re
import sys
import urllib.request
from pathlib import Path
from difflib import SequenceMatcher

SOURCE_URL = (
    "https://raw.githubusercontent.com/"
    "sm-monirulislam/Upcoming-and-Live-Sports-Data/"
    "main/Sports_data.m3u"
)

JSON_FILE = Path("data/matches/match-2.json")
MIN_SCORE = 0.72


def normalize(value):
    value = str(value or "").lower()
    value = re.sub(r"\b(vs?\.?|versus|live|hd|fhd|uhd|4k)\b", " ", value)
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return " ".join(value.split())


def match_score(first, second):
    a = normalize(first)
    b = normalize(second)

    if not a or not b:
        return 0.0
    if a == b:
        return 1.0

    aw = set(a.split())
    bw = set(b.split())
    common = aw & bw

    # Require at least two shared words to reduce wrong matches.
    if len(common) < 2:
        return 0.0

    overlap = len(common) / max(len(aw), len(bw))
    sequence = SequenceMatcher(None, a, b).ratio()
    return max(overlap, sequence)


def download_m3u():
    request = urllib.request.Request(
        SOURCE_URL,
        headers={"User-Agent": "Nova-TV-Match-2-Updater"}
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def parse_m3u(text):
    items = []
    name = None

    for line in text.splitlines():
        line = line.strip()

        if line.startswith("#EXTINF"):
            name = line.split(",", 1)[-1].strip()

        elif line and not line.startswith("#") and name:
            items.append({"name": name, "url": line})
            name = None

    return items


def main():
    if not JSON_FILE.exists():
        raise FileNotFoundError(f"Missing JSON: {JSON_FILE}")

    data = json.loads(JSON_FILE.read_text(encoding="utf-8"))
    match = data.get("match", data)

    if not isinstance(match, dict):
        raise ValueError("Unexpected JSON structure.")

    current_name = str(match.get("name", "")).strip()
    if not current_name:
        raise ValueError("Match name is missing from JSON.")

    print(f"Current match: {current_name}")

    entries = parse_m3u(download_m3u())
    if not entries:
        raise RuntimeError("The M3U source has no parsed entries.")

    # Find the closest matching entry.
    ranked = sorted(
        ((match_score(current_name, item["name"]), item)
         for item in entries),
        key=lambda pair: pair[0],
        reverse=True
    )

    score, best = ranked[0]
    print(f"Closest M3U match: {best['name']}")
    print(f"Similarity score: {score:.2f}")

    if score < MIN_SCORE:
        print("NO UPDATE: no reliable match found.")
        print("Available M3U matches:")
        for item in entries:
            print(f" - {item['name']}")
        return

    new_url = best["url"]
    changed = False

    if match.get("url") != new_url:
        match["url"] = new_url
        changed = True

    streams = match.setdefault("streams", [])
    if not isinstance(streams, list):
        raise ValueError("The JSON 'streams' value must be a list.")

    server = next(
        (
            s for s in streams
            if isinstance(s, dict) and s.get("name") == "Auto M3U"
        ),
        None
    )

    if server is None:
        streams.append({
            "name": "Auto M3U",
            "url": new_url,
            "show": "yes"
        })
        changed = True
    elif server.get("url") != new_url:
        server["url"] = new_url
        server["show"] = "yes"
        changed = True

    if changed:
        JSON_FILE.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8"
        )
        print(f"UPDATED: {JSON_FILE}")
        print(f"Selected match: {best['name']}")
    else:
        print("NO CHANGE: the selected URL is already current.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
