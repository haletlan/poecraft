#!/usr/bin/env python3
"""Převede data z Path of Building (src/Data/*.lua) do data/pob.json.

Použití:  python tools/build_data.py <cesta k PathOfBuilding/src/Data> data/pob.json
Potřebuje: pip install lupa
"""
import json, os, sys
from lupa import LuaRuntime

EQUIPMENT = {
    "Amulet", "Belt", "Body Armour", "Boots", "Bow", "Claw", "Dagger", "Gloves", "Helmet",
    "One Handed Axe", "One Handed Mace", "One Handed Sword", "Quiver", "Ring", "Sceptre",
    "Shield", "Staff", "Two Handed Axe", "Two Handed Mace", "Two Handed Sword", "Wand",
}

lua = LuaRuntime(unpack_returned_tuples=True)
lua_len = lua.eval("function(t) return #t end")


def run(path, *args):
    with open(path, encoding="utf-8") as f:
        res = lua.execute(f.read())
    return res(*args) if args else res


def arr(t):
    return [t[i] for i in range(1, lua_len(t) + 1)] if t is not None else []


def tdict(t):
    return {k: t[k] for k in t.keys()} if t is not None else {}


def mod_entry(mid, m):
    return {
        "id": mid,
        "type": m["type"],
        "lines": [str(x) for x in arr(m)],
        "level": int(m["level"] or 1),
        "group": m["group"] or "",
        "wk": [str(x) for x in arr(m["weightKey"])],
        "wv": [int(x) for x in arr(m["weightVal"])],
        "tags": [str(x) for x in arr(m["modTags"])],
    }


def main(src, out):
    data = {"version": "", "bases": {}, "mods": {}, "veiled": {}, "master": [], "essences": []}

    # --- Bases
    bases = lua.table()
    for fn in sorted(os.listdir(os.path.join(src, "Bases"))):
        if fn.endswith(".lua"):
            run(os.path.join(src, "Bases", fn), bases)
    for name in bases.keys():
        b = bases[name]
        if b["type"] not in EQUIPMENT:
            continue
        tags = [k for k, v in tdict(b["tags"]).items() if v]
        req = b["req"]
        data["bases"][str(name)] = {
            "type": b["type"],
            "sub": b["subType"] or "",
            "tags": tags,
            "infl": {str(k): str(v) for k, v in tdict(b["influenceTags"]).items()},
            "implicit": b["implicit"] or "",
            "req": int(req["level"] or 0) if req is not None else 0,
        }

    # --- Essences (needed to know which mods are essence-only)
    ess = run(os.path.join(src, "Essence.lua"))
    essence_mod_ids = set()
    for key in ess.keys():
        e = ess[key]
        mods = {str(k): str(v) for k, v in tdict(e["mods"]).items()}
        essence_mod_ids.update(mods.values())
        data["essences"].append({"name": str(e["name"]), "tier": int(e["tier"] or 0), "mods": mods})

    # --- Explicit mods
    exp = run(os.path.join(src, "ModExplicit.lua"))
    for mid in exp.keys():
        m = exp[mid]
        if m["type"] not in ("Prefix", "Suffix"):
            continue
        entry = mod_entry(str(mid), m)
        if any(v > 0 for v in entry["wv"]) or str(mid) in essence_mod_ids:
            data["mods"][str(mid)] = entry

    # --- Veiled (Betrayal) mods
    vei = run(os.path.join(src, "ModVeiled.lua"))
    for mid in vei.keys():
        m = vei[mid]
        if m["type"] in ("Prefix", "Suffix"):
            data["veiled"][str(mid)] = mod_entry(str(mid), m)

    # --- Crafting bench
    mas = run(os.path.join(src, "ModMaster.lua"))
    for m in arr(mas):
        if m["type"] not in ("Prefix", "Suffix"):
            continue
        data["master"].append({
            "type": m["type"],
            "lines": [str(x) for x in arr(m)],
            "level": int(m["level"] or 1),
            "group": m["group"] or "",
            "tags": [str(x) for x in arr(m["modTags"])],
            "types": [str(k) for k, v in tdict(m["types"]).items() if v],
        })

    data["version"] = os.environ.get("POB_VERSION", "")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"bases={len(data['bases'])} mods={len(data['mods'])} veiled={len(data['veiled'])} "
          f"master={len(data['master'])} essences={len(data['essences'])} -> {out}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
