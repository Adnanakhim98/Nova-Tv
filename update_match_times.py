#!/usr/bin/env python3
# SPORTYNOVA Auto Match Time Updater (Rate-Limit Safe)
# Searches TheSportsDB for manually listed matches and updates startTime/endTime.
# API failures are recorded as API_ERROR, never mislabeled as NOT FOUND.

import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
API_KEY = os.getenv("THESPORTSDB_API_KEY") or "123"
API_BASE = f"https://www.thesportsdb.com/api/v1/json/{API_KEY}"
LOCAL_TZ = ZoneInfo("Asia/Dhaka")
STATUS_FILE = ROOT / "api-match-status.json"

MATCH_FILE_RE = re.compile(
    r"(^|/)(match-\d+\.json|live-sports\.json|sports-matches\.json|willow\.json)$",
    re.IGNORECASE,
)

DURATION_DEFAULTS = {
    "football": 120,
    "soccer": 120,
    "basketball": 150,
    "cricket": 240,
    "t20": 240,
    "odi": 600,
    "one day": 600,
    "test": 4320,
    "tennis": 180,
    "rugby": 120,
    "hockey": 120,
    "volleyball": 120,
}


def norm(value):
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()


def team_names(obj):
    home = obj.get("team1") or obj.get("homeTeam") or obj.get("home")
    away = obj.get("team2") or obj.get("awayTeam") or obj.get("away")
    if isinstance(home, dict):
        home = home.get("name") or home.get("teamName")
    if isinstance(away, dict):
        away = away.get("name") or away.get("teamName")
    if home and away:
        return str(home).strip(), str(away).strip()

    name = obj.get("name") or obj.get("matchName") or obj.get("title")
    if name:
        parts = re.split(r"\s+(?:vs?\.?|v|versus)\s+", str(name), flags=re.I)
        if len(parts) == 2:
            return parts[0].strip(), parts[1].strip()
    return None, None


def get_match_objects(data):
    found = []

    def walk(value, path=""):
        if isinstance(value, dict):
            a, b = team_names(value)
            if a and b:
                found.append((value, path or "$"))
            for key, child in value.items():
                walk(child, f"{path}.{key}" if path else key)
        elif isinstance(value, list):
            for i, child in enumerate(value):
                walk(child, f"{path}[{i}]")

    walk(data)
    return found


def api_search(event_name, max_retries=3):
    """
    Search TheSportsDB with rate-limit protection.
    The free API limit is low, so requests are spaced out globally by the caller.
    If HTTP 429 occurs, wait 65 seconds and retry (up to max_retries).
    """
    query = urllib.parse.urlencode({"e": event_name})
    url = f"{API_BASE}/searchevents.php?{query}"
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "SPORTYNOVA-AutoMatch/1.1"}
    )

    for attempt in range(max_retries + 1):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                payload = json.loads(response.read().decode("utf-8"))
            return payload.get("event") or [], None

        except urllib.error.HTTPError as exc:
            if exc.code == 429 and attempt < max_retries:
                wait_seconds = 65
                print(
                    f"[RATE LIMIT] HTTP 429. Waiting {wait_seconds}s "
                    f"before retry {attempt + 1}/{max_retries}..."
                )
                time.sleep(wait_seconds)
                continue
            return [], f"HTTP {exc.code}: {exc.reason}"

        except Exception as exc:
            return [], str(exc)

    return [], "HTTP 429: Too Many Requests (retry limit reached)"


def event_teams(event):
    return (
        str(event.get("strHomeTeam") or "").strip(),
        str(event.get("strAwayTeam") or "").strip(),
    )


def pair_matches(wanted_a, wanted_b, event):
    home, away = event_teams(event)
    wa, wb = norm(wanted_a), norm(wanted_b)
    eh, ea = norm(home), norm(away)
    return bool(eh and ea and ((wa == eh and wb == ea) or (wa == ea and wb == eh)))


def event_start(event):
    # Prefer the provider's UTC timestamp when available.
    stamp = event.get("strTimestamp")
    if stamp:
        try:
            parsed = datetime.fromisoformat(str(stamp).replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(LOCAL_TZ)
        except Exception:
            pass

    date_text = event.get("dateEvent")
    time_text = event.get("strTime")
    if not date_text:
        return None
    try:
        if time_text:
            time_text = str(time_text).strip()
            # Common provider time format is HH:MM:SS.
            parsed = datetime.strptime(
                f"{date_text} {time_text[:8]}", "%Y-%m-%d %H:%M:%S"
            )
        else:
            parsed = datetime.strptime(str(date_text), "%Y-%m-%d")
        # Provider local event time may not be Dhaka time; this fallback is approximate.
        return parsed.replace(tzinfo=LOCAL_TZ)
    except Exception:
        return None


def duration_for(obj, sport, event):
    explicit = obj.get("expectedDurationMinutes")
    if explicit:
        try:
            return max(1, int(explicit))
        except Exception:
            pass
    text = " ".join([
        str(sport or ""),
        str(obj.get("tournament") or ""),
        str(event.get("strLeague") or ""),
    ]).lower()
    for key, minutes in DURATION_DEFAULTS.items():
        if key in text:
            return minutes
    return 180


def iso_local(value):
    return value.isoformat(timespec="minutes")


def load_json(path):
    with path.open("r", encoding="utf-8-sig") as handle:
        return json.load(handle)


def save_json(path, data):
    with path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def main():
    summary = []
    scanned = 0
    matched = 0
    not_found = 0
    ambiguous = 0
    api_errors = 0

    json_files = [
        p for p in ROOT.rglob("*.json")
        if p.name.lower() != STATUS_FILE.name.lower()
        and MATCH_FILE_RE.search(p.relative_to(ROOT).as_posix())
        and ".git" not in p.parts
    ]

    for path in json_files:
        try:
            data = load_json(path)
        except Exception as exc:
            print(f"[SKIP] {path}: invalid JSON: {exc}")
            continue

        changed = False
        for obj, object_path in get_match_objects(data):
            scanned += 1
            a, b = team_names(obj)
            tournament = str(obj.get("tournament") or obj.get("league") or "").strip()
            sport = str(obj.get("sport") or obj.get("category") or "").strip()
            search_term = f"{a} {b}"
            events, error = api_search(search_term)

            record = {
                "file": path.relative_to(ROOT).as_posix(),
                "object": object_path,
                "team1": a,
                "team2": b,
                "tournament": tournament,
                "checkedAt": datetime.now(LOCAL_TZ).isoformat(timespec="seconds"),
            }

            if error:
                api_errors += 1
                record.update({"status": "API_ERROR", "message": error})
                obj["timeUpdateStatus"] = "API_ERROR"
                obj["timeUpdateMessage"] = error
                obj["timeCheckedAt"] = record["checkedAt"]
                changed = True
                summary.append(record)
                print(f"[API_ERROR] {a} vs {b}: {error}")
                time.sleep(2.2)
                continue

            candidates = [e for e in events if pair_matches(a, b, e)]

            # If a tournament was supplied, require a reasonably close league-name match.
            if tournament and candidates:
                wanted = norm(tournament)
                filtered = [
                    e for e in candidates
                    if wanted in norm(e.get("strLeague") or "")
                    or norm(e.get("strLeague") or "") in wanted
                ]
                if filtered:
                    candidates = filtered

            if len(candidates) == 0:
                not_found += 1
                record["status"] = "NOT FOUND"
                obj["timeUpdateStatus"] = "NOT FOUND"
                obj["timeUpdateMessage"] = "No exact team-pair match found in API."
                obj["timeCheckedAt"] = record["checkedAt"]
                changed = True
                print(f"[NOT FOUND] {a} vs {b}")
            elif len(candidates) > 1:
                ambiguous += 1
                record["status"] = "AMBIGUOUS"
                record["candidates"] = [
                    {
                        "event": e.get("strEvent"),
                        "league": e.get("strLeague"),
                        "date": e.get("dateEvent"),
                        "eventId": e.get("idEvent"),
                    }
                    for e in candidates[:10]
                ]
                obj["timeUpdateStatus"] = "AMBIGUOUS"
                obj["timeUpdateMessage"] = f"{len(candidates)} possible API matches."
                obj["timeCheckedAt"] = record["checkedAt"]
                changed = True
                print(f"[AMBIGUOUS] {a} vs {b}: {len(candidates)} candidates")
            else:
                event = candidates[0]
                start = event_start(event)
                if not start:
                    api_errors += 1
                    record.update({
                        "status": "API_ERROR",
                        "message": "Event matched, but API did not provide a usable date/time.",
                    })
                    obj["timeUpdateStatus"] = "API_ERROR"
                    obj["timeUpdateMessage"] = record["message"]
                    obj["timeCheckedAt"] = record["checkedAt"]
                    changed = True
                else:
                    duration = duration_for(obj, sport, event)
                    end = start + timedelta(minutes=duration)
                    matched += 1
                    record.update({
                        "status": "API MATCHED",
                        "event": event.get("strEvent"),
                        "league": event.get("strLeague"),
                        "eventId": event.get("idEvent"),
                        "startTime": iso_local(start),
                        "endTime": iso_local(end),
                        "endTimeEstimated": True,
                    })
                    obj["startTime"] = iso_local(start)
                    obj["endTime"] = iso_local(end)
                    obj["status"] = "auto"
                    obj["timeUpdateStatus"] = "API MATCHED"
                    obj["timeUpdateMessage"] = "Matched by exact team pair."
                    obj["matchedEvent"] = event.get("strEvent")
                    obj["matchedTournament"] = event.get("strLeague")
                    obj["providerEventId"] = event.get("idEvent")
                    obj["timeSource"] = "TheSportsDB"
                    obj["endTimeEstimated"] = True
                    obj["timeCheckedAt"] = record["checkedAt"]
                    changed = True
                    print(f"[API MATCHED] {a} vs {b}: {iso_local(start)}")
            summary.append(record)
            time.sleep(2.2)

        if changed:
            save_json(path, data)

    output = {
        "updatedAt": datetime.now(LOCAL_TZ).isoformat(timespec="seconds"),
        "provider": "TheSportsDB",
        "counts": {
            "scanned": scanned,
            "matched": matched,
            "notFound": not_found,
            "ambiguous": ambiguous,
            "apiErrors": api_errors,
        },
        "matches": summary,
    }
    save_json(STATUS_FILE, output)
    print("\nSPORTYNOVA API Match Check complete (rate-limit safe mode)")
    print(json.dumps(output["counts"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
