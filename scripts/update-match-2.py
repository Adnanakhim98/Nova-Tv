
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
MIN_SCORE = 0.78


def normalize(text):
    text = str(text or "").lower()
    text = re.sub(r"\b(vs?\.?|versus|live|hd|fhd|uhd|4k)\b", " ", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return " ".join(text.split())


def similarity(first, second):
    a = normalize(first)
    b = normalize(second)

    if not a or not b:
        return 0.0

    if a == b:
        return 1.0

    a_words = set(a.split())
    b_words = set(b.split())
    common = a_words & b_words

    # Avoid matching unrelated teams with only one common word.
    if len(common) < 2:
        return 0.0

    overlap = len(common) / max(len(a_words), len(b_words))
    sequence = SequenceMatcher(None, a, b).ratio()

    return max(overlap, sequence)


def download_m3u():
    request = urllib.request.Request(
        SOURCE_URL,
        headers={"User-Agent": "Nova-TV-Auto-Updater"}
    )

    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def parse_m3u(content):
    entries = []
    current_name = None

    for line in content.splitlines():
        line = line.strip()

        if line.startswith("#EXTINF"):
            current_name = line.split(",", 1)[-1].strip()

        elif line and not line.startswith("#") and current_name:
            entries.append({
                "name": current_name,
                "url": line
            })
            current_name = None

    return entries


def main():
    if not JSON_FILE.exists():
        raise FileNotFoundError(
            f"JSON file not found: {JSON_FILE}"
        )

    data = json.loads(JSON_FILE.read_text(encoding="utf-8"))

    # Supports either {"match": {...}} or a root-level match object.
    match = data.get("match", data)

    if not isinstance(match, dict):
        raise ValueError("Unexpected match-2.json structure.")

    match_name = match.get("name", "").strip()

    if not match_name:
        raise ValueError(
            "Match name not found. Expected name in the match object."
        )

    print(f"Searching M3U for: {match_name}")

    entries = parse_m3u(download_m3u())

    if not entries:
        raise RuntimeError("No M3U streams found.")

    ranked = sorted(
        (
            (similarity(match_name, item["name"]), item)
            for item in entries
        ),
        key=lambda result: result[0],
        reverse=True
    )

    score, best = ranked[0]

    print(f"Best candidate: {best['name']}")
    print(f"Match score: {score:.2f}")

    if score < MIN_SCORE:
        print("No reliable match. Existing links kept unchanged.")
        return

    new_url = best["url"]
    changed = False

    # Update the main URL.
    if match.get("url") != new_url:
        match["url"] = new_url
        changed = True

    # Update or create the Auto M3U server.
    streams = match.get("streams")

    if streams is None:
        streams = []
        match["streams"] = streams

    if not isinstance(streams, list):
        raise ValueError("'streams' must be a list.")

    auto_stream = next(
        (
            item for item in streams
            if isinstance(item, dict)
            and item.get("name") == "Auto M3U"
        ),
        None
    )

    if auto_stream is None:
        streams.append({
            "name": "Auto M3U",
            "url": new_url,
            "show": "yes"
        })
        changed = True
    elif auto_stream.get("url") != new_url:
        auto_stream["url"] = new_url
        auto_stream["show"] = "yes"
        changed = True

    if changed:
        JSON_FILE.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8"
        )
        print("SUCCESS: match-2.json updated.")
    else:
        print("No changes needed.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(1)
