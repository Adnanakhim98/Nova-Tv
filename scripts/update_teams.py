#!/usr/bin/env python3
"""Automatically build/update data/teams.json from filenames in logo/."""
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOGO_DIR = ROOT / "logo"
TEAMS_PATH = ROOT / "data" / "teams.json"
RAW_BASE = "https://raw.githubusercontent.com/Adnanakhim98/Nova-Tv/main/logo/"
SUPPORTED = {".png", ".jpg", ".jpeg", ".webp", ".svg"}

# Optional filename corrections for common clubs/teams. Add mappings here only if needed.
# The key is the filename without extension, normalized to lowercase letters/numbers.
KNOWN_NAMES = {
    "fenerbahce": "Fenerbahçe",
    "fenerbahcesk": "Fenerbahçe",
    "aekathens": "AEK Athens FC",
    "aekathensfc": "AEK Athens FC",
    "manutd": "Manchester United",
    "manchesterunited": "Manchester United",
    "mancity": "Manchester City",
    "manchestercity": "Manchester City",
    "realmadrid": "Real Madrid",
    "barcelona": "Barcelona",
    "fcbarcelona": "Barcelona",
    "psg": "Paris Saint-Germain",
    "parissaintgermain": "Paris Saint-Germain",
    "afghanistan": "Afghanistan",
    "indiawomen": "India Women",
    "india": "India",
}

def normalize(value):
    value = unicodedata.normalize("NFKD", str(value or ""))
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", "", value.casefold())

def display_name(stem):
    key = normalize(stem)
    if key in KNOWN_NAMES:
        return KNOWN_NAMES[key]
    # Turn common separators into spaces, then make a readable display name.
    value = re.sub(r"[_-]+", " ", stem).strip()
    value = re.sub(r"\s+", " ", value)
    # Preserve words already containing capitals; title-case all-lowercase filenames.
    if value.islower():
        value = value.title()
    return value

def load_existing():
    if not TEAMS_PATH.exists():
        return [], "list", None
    try:
        data = json.loads(TEAMS_PATH.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Invalid JSON in data/teams.json: {exc}")
    if isinstance(data, list):
        return data, "list", data
    if isinstance(data, dict) and isinstance(data.get("teams"), list):
        return data["teams"], "wrapped-list", data
    if isinstance(data, dict):
        return list(data.values()), "object-map", data
    raise SystemExit("data/teams.json must be a JSON array or object.")

def main():
    LOGO_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(
        p for p in LOGO_DIR.iterdir()
        if p.is_file() and p.suffix.lower() in SUPPORTED
    )
    records, shape, original = load_existing()

    # Index existing records by common team-name fields and aliases.
    index = {}
    for record in records:
        if not isinstance(record, dict):
            continue
        for field in ("name", "team", "title", "id"):
            if record.get(field):
                index[normalize(record[field])] = record
        aliases = record.get("aliases", [])
        if isinstance(aliases, list):
            for alias in aliases:
                index[normalize(alias)] = record

    added = updated = 0
    for image_path in files:
        name = display_name(image_path.stem)
        key = normalize(name)
        logo_url = RAW_BASE + image_path.name
        record = index.get(key)

        if record is None:
            # If the filename matches an existing team alias, update that team.
            record = index.get(normalize(image_path.stem))
        if record is None:
            record = {"name": name, "logo": logo_url}
            records.append(record)
            added += 1
        else:
            # Preserve existing fields; only fill name if missing and update logo.
            if not any(record.get(f) for f in ("name", "team", "title")):
                record["name"] = name
            record["logo"] = logo_url
            updated += 1

        # Index again so repeated filenames or aliases won't create duplicates in this run.
        for field in ("name", "team", "title", "id"):
            if record.get(field):
                index[normalize(record[field])] = record
        index[key] = record

    if shape == "list":
        output = records
    elif shape == "wrapped-list":
        original["teams"] = records
        output = original
    else:
        # Keep object-map shape, using each record's name as the key.
        output = {}
        for i, record in enumerate(records, 1):
            if isinstance(record, dict):
                map_key = record.get("name") or record.get("team") or record.get("id") or f"team-{i}"
                output[str(map_key)] = record
            else:
                output[f"team-{i}"] = record

    TEAMS_PATH.parent.mkdir(parents=True, exist_ok=True)
    TEAMS_PATH.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Scanned {len(files)} logo file(s). Added {added}; updated {updated}.")

if __name__ == "__main__":
    main()
