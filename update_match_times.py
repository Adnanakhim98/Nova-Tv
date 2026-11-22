#!/usr/bin/env python3
"""Update startTime/endTime in SPORTYNOVA match-*.json files from TheSportsDB."""
import json, os, re, urllib.parse, urllib.request
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

OWNER = os.getenv("GITHUB_REPOSITORY", "Adnanakhim98/Nova-Tv").split("/")[0]
REPO = os.getenv("GITHUB_REPOSITORY", "Adnanakhim98/Nova-Tv").split("/")[1]
BRANCH = os.getenv("MATCH_BRANCH", "main")
API_KEY = os.getenv("THESPORTSDB_API_KEY", "123")
TZ = ZoneInfo("Asia/Dhaka")
DURATIONS = {
    "football": 120, "soccer": 120, "basketball": 150,
    "tennis": 180, "volleyball": 120, "badminton": 90,
    "rugby": 120, "hockey": 180, "ice hockey": 180,
    "baseball": 210, "cricket": 240, "t20": 240,
    "odi": 600, "one day": 600, "test": 4320, "test cricket": 4320,
    "default": 180,
}
MATCH_FILE_RE = re.compile(r"(?:^|/)(?:match[-_ ]?\d+|live[-_]?sports|sports[-_]?matches|willow)\.json$", re.I)

def request_json(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": "SPORTYNOVA-AutoMatch/1.0",
        "Accept": "application/vnd.github+json"
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))

def api_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "SPORTYNOVA-AutoMatch/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))

def norm(s):
    return re.sub(r"[^a-z0-9]+", "", str(s or "").lower())

def find_match_objects(obj, path=""):
    found = []
    def walk(value):
        if isinstance(value, dict):
            # Match objects are the named objects that hold a stream or match metadata.
            has_name = any(value.get(k) for k in ("name", "title", "matchName", "match_name"))
            has_stream = any(value.get(k) for k in ("url", "streams", "servers", "streamUrl", "stream_url"))
            has_meta = any(k in value for k in ("startTime", "endTime", "matchType", "match_type", "tournament", "league", "section"))
            if has_name and (has_stream or has_meta):
                found.append(value)
            for v in value.values():
                walk(v)
        elif isinstance(value, list):
            for v in value:
                walk(v)
    walk(obj)
    # deduplicate identical object references
    seen, unique = set(), []
    for item in found:
        if id(item) not in seen:
            seen.add(id(item)); unique.append(item)
    return unique

def split_teams(match):
    a = match.get("team1") or match.get("homeTeam") or match.get("home_team")
    b = match.get("team2") or match.get("awayTeam") or match.get("away_team")
    if a and b:
        return str(a).strip(), str(b).strip()
    title = str(match.get("name") or match.get("title") or "")
    parts = re.split(r"\s+(?:vs?\.?|versus|v)\s+", title, flags=re.I)
    if len(parts) == 2:
        return parts[0].strip(), parts[1].strip()
    return None, None

def select_event(events, match):
    a, b = split_teams(match)
    if not a or not b:
        return None, "NOT FOUND", "দুই দলের নাম পাওয়া যায়নি"
    wanted = {norm(a), norm(b)}
    tournament = norm(match.get("tournament") or match.get("league") or match.get("competition") or "")
    ranked = []
    for event in events or []:
        home, away = norm(event.get("strHomeTeam")), norm(event.get("strAwayTeam"))
        event_teams = {home, away} - {""}
        score = 0
        if wanted == event_teams: score = 100
        elif wanted.issubset(event_teams): score = 95
        else:
            title = norm(event.get("strEvent"))
            if all(x in title for x in wanted): score = 80
        if not score: continue
        league = norm(event.get("strLeague"))
        if tournament:
            if tournament == league or tournament in league or league in tournament:
                score += 35
            else:
                score -= 25
        ranked.append((score, event))
    ranked.sort(key=lambda x: x[0], reverse=True)
    if not ranked: return None, "NOT FOUND", "ফিক্সচার পাওয়া যায়নি"
    # More than one credible candidate means the event cannot be safely identified.
    credible = [x for x in ranked if x[0] >= 80]
    if len(credible) > 1:
        return None, "AMBIGUOUS", "একাধিক ম্যাচ মিলে গেছে; JSON-এ সঠিক tournament লিখুন"
    if ranked[0][0] < 80:
        return None, "NOT FOUND", "ম্যাচের নাম যথেষ্ট নিশ্চিতভাবে মেলেনি"
    if tournament and ranked[0][0] < 100:
        return None, "AMBIGUOUS", "Tournament নিশ্চিতভাবে মেলেনি; ভুল ম্যাচ এড়াতে আপডেট বন্ধ"
    return ranked[0][1], "API MATCHED", None

def get_start(event):
    stamp = event.get("strTimestamp")
    if stamp:
        try:
            dt = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
            if dt.tzinfo is None: dt = dt.replace(tzinfo=TZ)
            return dt.astimezone(TZ)
        except ValueError:
            pass
    date, clock = event.get("dateEvent"), event.get("strTime")
    if not date or not clock or clock in ("00:00", "00:00:00"):
        return None
    try:
        return datetime.fromisoformat(f"{date}T{clock}").replace(tzinfo=TZ)
    except ValueError:
        return None

def duration_for(match):
    explicit = match.get("expectedDurationMinutes")
    if explicit:
        try: return max(1, int(explicit))
        except (TypeError, ValueError): pass
    raw = " ".join(str(match.get(k) or "") for k in ("sport", "matchType", "match_type", "category")).lower()
    if "test" in raw: return DURATIONS["test"]
    if "odi" in raw or "one day" in raw: return DURATIONS["odi"]
    for key, value in DURATIONS.items():
        if key != "default" and key in raw: return value
    return DURATIONS["default"]

def update_object(match):
    a, b = split_teams(match)
    if not a or not b:
        match["apiMatchStatus"] = "NOT FOUND"
        match["timeUpdateStatus"] = "team names missing"
        return False, "NOT FOUND", "team names missing", None
    query = urllib.parse.urlencode({"e": f"{a} vs {b}"})
    url = f"https://www.thesportsdb.com/api/v1/json/{API_KEY}/searchevents.php?{query}"
    try:
        payload = api_json(url)
    except Exception as exc:
        match["apiMatchStatus"] = "NOT FOUND"
        match["timeUpdateStatus"] = f"API error: {exc}"
        return False, "NOT FOUND", match["timeUpdateStatus"], None
    event, api_status, error = select_event(payload.get("event"), match)
    if error:
        match["apiMatchStatus"] = api_status
        match["timeUpdateStatus"] = error
        return False, api_status, error, None
    start = get_start(event)
    if not start:
        match["apiMatchStatus"] = "API MATCHED"
        match["timeUpdateStatus"] = "ফিক্সচার পাওয়া গেছে, কিন্তু নির্দিষ্ট শুরুর সময় এখনো প্রকাশিত হয়নি"
        match["matchedEvent"] = event.get("strEvent", "")
        return False, "API MATCHED", match["timeUpdateStatus"], event
    end = start + timedelta(minutes=duration_for(match))
    match["team1"], match["team2"] = a, b
    match["startTime"] = start.isoformat(timespec="seconds")
    match["endTime"] = end.isoformat(timespec="seconds")
    match["status"] = "auto"
    match["apiMatchStatus"] = "API MATCHED"
    match["timeUpdateStatus"] = "updated"
    match["matchedEvent"] = event.get("strEvent", "")
    match["matchedTournament"] = event.get("strLeague", "")
    match["providerEventId"] = event.get("idEvent", "")
    match["timeSource"] = "TheSportsDB"
    match["endTimeEstimated"] = True
    return True, "API MATCHED", f"{event.get('strEvent')} => {match['startTime']} / {match['endTime']}", event

def main():
    tree_url = f"https://api.github.com/repos/{OWNER}/{REPO}/git/trees/{BRANCH}?recursive=1"
    tree = request_json(tree_url)
    paths = [x["path"] for x in tree.get("tree", [])
             if x.get("type") == "blob" and x["path"].lower().endswith(".json")
             and MATCH_FILE_RE.search(x["path"])]
    print(f"Found {len(paths)} possible match JSON files")
    updated = 0
    report = []
    checked_at = datetime.now(TZ).isoformat(timespec="seconds")
    for path in paths:
        local = path
        if not os.path.exists(local):
            raw = f"https://raw.githubusercontent.com/{OWNER}/{REPO}/{BRANCH}/" + urllib.parse.quote(path, safe="/")
            try:
                data = api_json(raw)
            except Exception as exc:
                print(f"SKIP {path}: read failed: {exc}")
                continue
        else:
            with open(local, encoding="utf-8") as f: data = json.load(f)
        changed = False
        for match in find_match_objects(data, path):
            section = str(match.get("section") or "").lower()
            category = str(match.get("category") or "").lower()
            name = str(match.get("name") or match.get("title") or "")
            if not (section in ("livesports", "live sports") or "sports" in category
                    or re.search(r"\s(?:vs?\.?|versus|v)\s", name, re.I)):
                continue
            a, b = split_teams(match)
            ok, api_status, message, event = update_object(match)
            report.append({
                "name": name or (f"{a} vs {b}" if a and b else "Unnamed match"),
                "team1": a or "", "team2": b or "",
                "tournament": match.get("tournament") or match.get("league") or match.get("competition") or "",
                "sport": match.get("sport") or match.get("category") or "",
                "file": path,
                "status": api_status,
                "message": message,
                "matchedEvent": (event or {}).get("strEvent", "") if event else match.get("matchedEvent", ""),
                "matchedTournament": (event or {}).get("strLeague", "") if event else match.get("matchedTournament", ""),
                "startTime": match.get("startTime", ""),
                "endTime": match.get("endTime", ""),
                "lastChecked": checked_at
            })
            print(api_status + " " + path + ": " + message)
            changed = changed or ok
        if changed:
            os.makedirs(os.path.dirname(local) or ".", exist_ok=True)
            with open(local, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
                f.write("\n")
            updated += 1
    summary = {
        "generatedAt": checked_at,
        "repository": f"{OWNER}/{REPO}",
        "total": len(report),
        "matched": sum(1 for x in report if x["status"] == "API MATCHED"),
        "notFound": sum(1 for x in report if x["status"] == "NOT FOUND"),
        "ambiguous": sum(1 for x in report if x["status"] == "AMBIGUOUS"),
        "matches": report
    }
    with open("api-match-status.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"Updated {updated} JSON file(s). Status report: {len(report)} matches.")

if __name__ == "__main__":
    main()
