
import json
import re
import sys
import urllib.request
from pathlib import Path

SOURCE_URL = (
    "https://raw.githubusercontent.com/"
    "sm-monirulislam/Upcoming-and-Live-Sports-Data/"
    "main/Sports_data.m3u"
)

JSON_FILE = Path("data/matches/match-2.json")


def normalize(text):
    text = str(text or "").lower()
    text = text.replace("&", " and ")
    text = re.sub(r"\b(vs?\.?|versus)\b", " vs ", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return " ".join(text.split())


def split_teams(name):
    normalized = normalize(name)
    parts = re.split(r"\bvs\b", normalized, maxsplit=1)

    if len(parts) != 2:
        return None

    return parts[0].strip(), parts[1].strip()


def fetch_m3u():
    request = urllib.request.Request(
        SOURCE_URL,
        headers={"User-Agent": "Nova-TV-Match-2-Updater"}
    )
    with urllib.request.urlopen(request, timeout=40) as response:
        return response.read().decode("utf-8", errors="replace")


def parse_m3u(content):
    results = []
    current_name = None

    for line in content.splitlines():
        line = line.strip()

        if line.startswith("#EXTINF"):
            current_name = line.split(",", 1)[-1].strip()

        elif line and not line.startswith("#") and current_name:
            results.append({
                "name": current_name,
                "url": line
            })
            current_name = None

    return results


def contains_team(entry_name, team):
    entry = normalize(entry_name)
    team = normalize(team)

    # Allow spelling variations such as Al-Ahli / Al Ahli.
    team_words = team.split()
    if not team_words:
        return False

    entry_words = set(entry.split())
    return all(word in entry_words for word in team_words)


def main():
    if not JSON_FILE.exists():
        raise FileNotFoundError(f"Missing file: {JSON_FILE}")

    data = json.loads(JSON_FILE.read_text(encoding="utf-8"))
    match = data.get("match", data)

    if not isinstance(match, dict):
        raise ValueError("Unexpected match-2.json structure.")

    match_name = str(match.get("name", "")).strip()
    teams = split_teams(match_name)

    if not teams:
        raise ValueError(
            "Match name must contain Vs, e.g. Al-Ahli Vs Al-Khaleej."
        )

    team_a, team_b = teams
    print(f"Searching for: {team_a} vs {team_b}")

    entries = parse_m3u(fetch_m3u())

    matched = [
        item for item in entries
        if contains_team(item["name"], team_a)
        and contains_team(item["name"], team_b)
    ]

    # Remove duplicate URLs.
    unique = []
    seen_urls = set()

    for item in matched:
        if item["url"] not in seen_urls:
            seen_urls.add(item["url"])
            unique.append(item)

    if not unique:
        print("No matching streams found in Sports_data.m3u.")
        print("Existing JSON links have been preserved.")
        return

    streams = match.setdefault("streams", [])

    if not isinstance(streams, list):
        raise ValueError("match.streams must be a JSON array.")

    # Replace only streams created by this updater.
    streams[:] = [
        stream for stream in streams
        if not (
            isinstance(stream, dict)
            and stream.get("source") == "Sports_data.m3u"
        )
    ]

    for index, item in enumerate(unique, start=1):
        streams.append({
            "name": f"Auto M3U {index}",
            "url": item["url"],
            "show": "yes",
            "source": "Sports_data.m3u"
        })

    # Set primary URL to the first matching stream.
    match["url"] = unique[0]["url"]

    JSON_FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8"
    )

    print(f"Updated {JSON_FILE}")
    print(f"Matching streams added: {len(unique)}")

    for item in unique:
        print(f"- {item['name']}: {item['url']}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
