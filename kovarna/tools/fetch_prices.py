#!/usr/bin/env python3
"""Stáhne ceny z poe.ninja a uloží je do data/prices.json.

Použití:  python tools/fetch_prices.py data/prices.json
Ligu lze vynutit proměnnou prostředí LEAGUE (např. LEAGUE="Covens of Umbra").
Bez ní skript vezme aktuální softcore trade ligu z poe.ninja.
"""
import datetime, json, os, sys, time, urllib.parse, urllib.request

UA = {"User-Agent": "kovarna-price-bot/1.0 (+GitHub Pages crafting planner)"}
BASES = ["https://poe.ninja/api/data", "https://poe.ninja/poe1/api/data"]
CURRENCY_TYPES = ["Currency", "Fragment"]
ITEM_TYPES = ["Essence", "Fossil", "Resonator", "Oil", "Beast", "BaseType"]


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def first_working(path):
    last = None
    for base in BASES:
        try:
            return get(base + path)
        except Exception as e:  # noqa: BLE001
            last = e
    raise RuntimeError(f"poe.ninja nevrátil data pro {path}: {last}")


def detect_league():
    if os.environ.get("LEAGUE"):
        return os.environ["LEAGUE"]
    state = first_working("/getindexstate")
    for lg in state.get("economyLeagues", []):
        name = lg.get("name", "")
        low = name.lower()
        if lg.get("hardcore") or "standard" in low or "ruthless" in low or "hardcore" in low:
            continue
        return name
    raise RuntimeError("Nepodařilo se zjistit aktuální ligu, nastav proměnnou LEAGUE.")


def main(out):
    league = detect_league()
    q = urllib.parse.quote(league)
    items, bases = {"Chaos Orb": 1.0}, []

    for t in CURRENCY_TYPES:
        data = first_working(f"/currencyoverview?league={q}&type={t}")
        for line in data.get("lines", []):
            name, val = line.get("currencyTypeName"), line.get("chaosEquivalent")
            if name and val:
                items[name] = round(float(val), 3)
        time.sleep(1)

    for t in ITEM_TYPES:
        data = first_working(f"/itemoverview?league={q}&type={t}")
        for line in data.get("lines", []):
            name, val = line.get("name"), line.get("chaosValue")
            if not name or val is None:
                continue
            if t == "BaseType":
                if (line.get("levelRequired") or 0) < 75:   # pro endgame craft stačí ilvl 75+
                    continue
                bases.append({
                    "name": line.get("baseType") or name,
                    "ilvl": line.get("levelRequired"),
                    "variant": line.get("variant"),
                    "chaos": round(float(val), 2),
                    "count": line.get("listingCount") or line.get("count"),
                })
            elif name not in items or (line.get("variant") is None):
                items[name] = round(float(val), 3)
        time.sleep(1)

    if "Divine Orb" not in items:
        raise RuntimeError("V datech chybí Divine Orb, odpověď poe.ninja má asi jiný formát.")

    result = {
        "league": league,
        "updated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "poe.ninja",
        "divine": items["Divine Orb"],
        "items": dict(sorted(items.items())),
        "bases": bases,
    }
    with open(out, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, separators=(",", ":"))
    print(f"liga={league} položek={len(items)} base={len(bases)} -> {out}")


if __name__ == "__main__":
    main(sys.argv[1])
