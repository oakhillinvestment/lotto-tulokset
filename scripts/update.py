import csv
import json
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
import time

BASE_URL = "https://www.veikkaus.fi/api/draw-results/v1/games/LOTTO/draws/by-week/{week}"

HEADERS = {
    "Accept": "application/json",
    "User-Agent": "LottoTulosArkisto/1.0"
}

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
CSV_PATH = DATA_DIR / "lotto.csv"
LATEST_PATH = DATA_DIR / "latest.json"

DATA_DIR.mkdir(exist_ok=True)

FETCH_HISTORY = False


def current_weeks():
    now = datetime.now(ZoneInfo("Europe/Helsinki"))
    monday = now.date() - timedelta(days=now.weekday())

    if FETCH_HISTORY:
        # Vuoden 2018 ensimmäisen ISO-viikon maanantai.
        day = monday.replace(year=2018, month=1, day=1)
    else:
        day = monday - timedelta(days=7)

    while day <= monday:
        year, week, _ = day.isocalendar()
        yield f"{year}-W{week:02d}"
        day += timedelta(days=7)

def fetch_week(week):
    response = requests.get(
        BASE_URL.format(week=week),
        headers=HEADERS,
        timeout=30
    )
    response.raise_for_status()
    return response.json()

def lotto_draws(data):
    if not isinstance(data, list):
        return []

    return [
        item for item in data
        if item.get("gameName") == "LOTTO"
        and item.get("results")
    ]

def parse_draw(draw):
    result = draw["results"][0]
    primary = result.get("primary", [])
    secondary = result.get("secondary", [])

    if len(primary) != 7:
        return None

    draw_time = draw.get("drawTime")
    draw_date = (
        datetime.fromtimestamp(
            draw_time / 1000,
            ZoneInfo("Europe/Helsinki")
        ).date().isoformat()
        if draw_time else ""
    )

    return {
        "pvm": draw_date,
        "arvonta_id": str(draw.get("id", "")),
        "n1": primary[0],
        "n2": primary[1],
        "n3": primary[2],
        "n4": primary[3],
        "n5": primary[4],
        "n6": primary[5],
        "n7": primary[6],
        "lisänumero": secondary[0] if secondary else "",
        "tuplaus": result.get("multiplier", ""),
    }

def load_existing():
    if not CSV_PATH.exists():
        return []

    with CSV_PATH.open("r", encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file))

def save_csv(rows):
    fieldnames = [
        "pvm", "arvonta_id",
        "n1", "n2", "n3", "n4", "n5", "n6", "n7",
        "lisänumero", "tuplaus"
    ]

    rows = sorted(
        rows,
        key=lambda row: (row["pvm"], int(row["arvonta_id"]))
    )

    with CSV_PATH.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

def save_latest(latest):
    with LATEST_PATH.open("w", encoding="utf-8") as file:
        json.dump(latest, file, ensure_ascii=False, indent=2)

existing = load_existing()
existing_ids = {row["arvonta_id"] for row in existing}

for week in current_weeks():
    print(f"Haetaan {week}", flush=True)
    time.sleep(1)

    for draw in lotto_draws(fetch_week(week)):
        parsed = parse_draw(draw)

        if parsed and parsed["arvonta_id"] not in existing_ids:
            existing.append(parsed)
            existing_ids.add(parsed["arvonta_id"])

if not existing:
    raise SystemExit("Ei Lotto-tuloksia tallennettavana.")

save_csv(existing)

latest = max(
    existing,
    key=lambda row: (row["pvm"], int(row["arvonta_id"]))
)

save_latest(latest)

print(
    f"Päivitetty: {latest['pvm']} — "
    f"{', '.join(latest[f'n{i}'] for i in range(1, 8))}"
)
