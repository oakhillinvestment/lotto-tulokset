import csv
import sys
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("data/lotto.csv")
with path.open(encoding="utf-8-sig", newline="") as f:
    reader = csv.DictReader(f)
    required = {"pvm", "arvonta_id", "lisänumero", *[f"n{i}" for i in range(1, 8)]}
    if not required.issubset(reader.fieldnames or []):
        raise SystemExit("VIRHE: pakollisia sarakkeita puuttuu")
    rows = list(reader)

errors = []
notes = []
dates = []
ids = []
for line, row in enumerate(rows, 2):
    try:
        if None in row or any(v is None for v in row.values()):
            raise ValueError("virheellinen sarakemäärä")
        d = date.fromisoformat(row["pvm"])
        nums = [int(row[f"n{i}"]) for i in range(1, 8)]
        extra = int(row["lisänumero"])
        identifier = int(row["arvonta_id"])
        if len(set(nums)) != 7:
            raise ValueError("päänumeroissa toistoja")
        if not all(1 <= n <= 40 for n in nums + [extra]):
            raise ValueError("numero alueen 1–40 ulkopuolella")
        if extra in nums:
            raise ValueError("lisänumero esiintyy päänumeroissa")
        dates.append(d)
        ids.append(identifier)
        if d.weekday() != 5:
            notes.append(f"Rivi {line}: poikkeava viikonpäivä {d}")
    except (ValueError, TypeError, KeyError) as e:
        errors.append(f"Rivi {line}: {e}")

if not dates:
    raise SystemExit("VIRHE: ei kelvollisia arvontoja")
for name, values in (("arvontatunniste", ids), ("päivämäärä", dates)):
    for value, count in Counter(values).items():
        if count > 1:
            errors.append(f"Toistuva {name}: {value} ({count} kertaa)")
if dates != sorted(dates):
    errors.append("Rivit eivät ole aikajärjestyksessä")
first = date(2018, 1, 1)
last = max(dates) - timedelta(days=max(dates).weekday())
expected = set()
while first <= last:
    expected.add(first.isocalendar()[:2])
    first += timedelta(days=7)
actual = {d.isocalendar()[:2] for d in dates}
for y, w in sorted(expected - actual):
    errors.append(f"Puuttuva ISO-viikko: {y}-W{w:02d}")
for week, count in Counter(d.isocalendar()[:2] for d in dates).items():
    if count > 1:
        notes.append(f"Useita arvontoja ISO-viikolla {week}: {count}")
print(f"Arvontoja: {len(rows)}")
print(f"Aikaväli: {min(dates)} – {max(dates)}")
print(f"ISO-viikkoja: {len(actual)} / odotettu {len(expected)}")
print(f"Virheitä: {len(errors)}; huomioita: {len(notes)}")
for message in errors:
    print("VIRHE:", message)
for message in notes:
    print("HUOMIO:", message)
print("Tarkistus ei varmista numeroiden vastaavuutta viralliseen lähteeseen.")
sys.exit(1 if errors else 0)
