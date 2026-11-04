#!/usr/bin/env python3
"""Merge registered local team logos into data/teams.json without deleting other team data."""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOGO_DIR = ROOT / "logo"
REGISTRY_PATH = ROOT / "data" / "team-registry.json"
TEAMS_PATH = ROOT / "data" / "teams.json"
RAW_BASE = "https://raw.githubusercontent.com/Adnanakhim98/Nova-Tv/main/logo/"

SUPPORTED = {".png", ".jpg", ".jpeg", ".webp", ".svg"}


def norm(value):
    return re.sub(r"[^a-z0-9]+", "", str(value or "").casefold())


def load_json(path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Invalid JSON in {path.relative_to(ROOT)}: {exc}")


def main():
    registry_data = load_json(REGISTRY_PATH, {"teams": []})
    registry = registry_data.get("teams", [])
    if not isinstance(registry, list):
        raise SystemExit('data/team-registry.json must contain a "teams" array.')

    # Build a lookup using official names and aliases, and accept only explicitly registered files.
    by_alias = {}
    for item in registry:
        name = item.get("name", "").strip()
        filename = item.get("logoFile", "").strip()
        if not name or not filename:
            print(f"Skipping invalid registry entry: {item!r}")
            continue
        item_aliases = [name] + item.get("aliases", [])
        for alias in item_aliases:
            by_alias[norm(alias)] = item

    existing = load_json(TEAMS_PATH, [])
    if isinstance(existing, list):
        records = existing
        container_type = "list"
    elif isinstance(existing, dict):
        # Support object maps keyed by team name as well as {"teams": [...]}.
        if isinstance(existing.get("teams"), list):
            records = existing["teams"]
            container_type = "wrapped-list"
        else:
            records = list(existing.values())
            container_type = "object-map"
    else:
        raise SystemExit("data/teams.json must be a JSON array or object.")

    # Preserve existing entries and their other fields; match on name or aliases.
    index = {}
    for record in records:
        if not isinstance(record, dict):
            continue
        for key in ("name", "team", "title", "id"):
            val = record.get(key)
            if val:
                index[norm(val)] = record
        for alias in record.get("aliases", []) if isinstance(record.get("aliases", []), list) else []:
            index[norm(alias)] = record

    added = updated = skipped = 0
    for item in registry:
        name = item.get("name", "").strip()
        filename = item.get("logoFile", "").strip()
        if not name or not filename:
            continue
        path = (LOGO_DIR / filename).resolve()
        if LOGO_DIR.resolve() not in path.parents:
            print(f"Skipping unsafe logo path: {filename}")
            skipped += 1
            continue
        if path.suffix.lower() not in SUPPORTED or not path.is_file():
            print(f"Logo not found / unsupported for {name}: logo/{filename}")
            skipped += 1
            continue

        target = index.get(norm(name))
        if target is None:
            for alias in item.get("aliases", []):
                target = index.get(norm(alias))
                if target is not None:
                    break

        logo_url = RAW_BASE + filename
        if target is None:
            target = {
                "name": name,
                "aliases": item.get("aliases", []),
                "logo": logo_url
            }
            records.append(target)
            added += 1
        else:
            target["name"] = target.get("name") or name
            # Keep aliases that already exist and add registry aliases without duplicates.
            old_aliases = target.get("aliases", [])
            if not isinstance(old_aliases, list):
                old_aliases = []
            target["aliases"] = list(dict.fromkeys(old_aliases + item.get("aliases", [])))
            target["logo"] = logo_url
            updated += 1

        for key in ("name", "team", "title", "id"):
            val = target.get(key)
            if val:
                index[norm(val)] = target
        for alias in target.get("aliases", []):
            index[norm(alias)] = target

    if container_type == "list":
        output = records
    elif container_type == "wrapped-list":
        existing["teams"] = records
        output = existing
    else:
        # Preserve object-map shape; key records by their current name.
        output = {}
        for record in records:
            if isinstance(record, dict):
                key = record.get("name") or record.get("team") or record.get("id")
                if key is None:
                    key = f"team-{len(output) + 1}"
                output[str(key)] = record
            else:
                output[f"team-{len(output) + 1}"] = record

    TEAMS_PATH.parent.mkdir(parents=True, exist_ok=True)
    TEAMS_PATH.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Done. Added: {added}; updated: {updated}; skipped: {skipped}")


if __name__ == "__main__":
    main()
