#!/usr/bin/env python3
import csv
import io
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

CSV_PATH = Path("data/lotto.csv")
API_TEMPLATE = "https://www.veikkaus.fi/api/draw-results/v1/games/LOTTO/draws/by-week/{year}-W{week:02d}"

def load_csv():
    text = CSV_PATH.read_text(encoding="utf-8-sig")
    rows = list(csv.DictReader(io.StringIO(text)))
    if not rows:
        raise RuntimeError("lotto.csv on tyhjä.")
    return rows

def parse_date(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))

def fetch_week(year, week):
    url = API_TEMPLATE.format(year=year, week=week)
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Lottoarkisto/1.0 (+https://lotto-tulokset.pages.dev/)",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))

def flatten_draws(data):
    if isinstance(data, list):
        items = data
    elif isinstance(data, dict):
        items = data.get("draws") or data.get("results") or []
    else:
        return []

    draws = []
    for item in items:
        if not isinstance(item, dict):
            continue
        if str(item.get("gameName", "")).upper() != "LOTTO":
            continue

        draw_time = item.get("drawTime")
        if not draw_time:
            continue

        primary = item.get("primary") or []
        secondary = item.get("secondary") or []
        tertiary = item.get("tertiary") or []

        nums = [int(x) for x in primary if str(x).isdigit()]
        if len(nums) < 6:
            continue

        draws.append({
            "date": parse_date(draw_time).astimezone(timezone.utc).date().isoformat(),
            "id": str(item.get("id", "")).strip(),
            "primary": sorted(nums),
            "secondary": [int(x) for x in secondary if str(x).isdigit()],
            "tertiary": [int(x) for x in tertiary if str(x).isdigit()],
        })
    return draws

def candidate_weeks(today):
    # Haetaan tämän ja kolmen edellisen viikon tulokset. Tämä tekee hausta
    # hieman vikasietoisemman, jos Veikkauksen rajapinnan viikon kohdistus muuttuu.
    iso = today.isocalendar()
    year, week = iso.year, iso.week
    result = []
    for _ in range(4):
        result.append((year, week))
        week -= 1
        if week == 0:
            year -= 1
            week = datetime(year, 12, 28).isocalendar().week
    return result

def make_row(draw):
    secondary = draw["secondary"][0] if draw["secondary"] else ""
    tertiary = draw["tertiary"][0] if draw["tertiary"] else ""
    return {
        "pvm": draw["date"],
        "arvonta_id": draw["id"],
        "n1": draw["primary"][0],
        "n2": draw["primary"][1],
        "n3": draw["primary"][2],
        "n4": draw["primary"][3],
        "n5": draw["primary"][4],
        "n6": draw["primary"][5],
        "n7": draw["primary"][6] if len(draw["primary"]) >= 7 else "",
        "lisänumero": secondary,
        "tuplaus": tertiary,
    }

def main():
    rows = load_csv()
    latest_date = max(r["pvm"] for r in rows)

    # Jos arvonta on jo CSV:ssä, mitään ei tehdä.
    existing_ids = {str(r.get("arvonta_id", "")).strip() for r in rows}

    now = datetime.now(timezone.utc).date()
    candidates = []

    for year, week in candidate_weeks(now):
        try:
            candidates.extend(fetch_week(year, week))
        except Exception as exc:
            print(f"Rajapintahaku epäonnistui {year}-W{week:02d}: {exc}", file=sys.stderr)

    # Valitaan uusin tulos, joka on CSV:n viimeistä päivää uudempi.
    candidates = [
        d for d in candidates
        if d["date"] > latest_date and (not d["id"] or d["id"] not in existing_ids)
    ]

    if not candidates:
        print(f"Ei uutta Lottoarvontaa. CSV:n viimeisin päivä: {latest_date}")
        return 0

    candidates.sort(key=lambda d: (d["date"], d["id"]))
    new_draw = candidates[-1]
    row = make_row(new_draw)

    fieldnames = ["pvm", "arvonta_id", "n1", "n2", "n3", "n4", "n5", "n6", "n7", "lisänumero", "tuplaus"]

    with CSV_PATH.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows + [row])

    print(
        f"Uusi Lottoarvonta lisätty: {row['pvm']} "
        f"(ID {row['arvonta_id']}): "
        f"{row['n1']} {row['n2']} {row['n3']} {row['n4']} "
        f"{row['n5']} {row['n6']} {row['n7']}"
    )
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
