// Kovárna – engine. Žádná AI: jen data z Path of Building, ceny a pravděpodobnost.
import { MOD_COUNT_WEIGHTS, HARVEST_REFORGES, ESSENCE_MIN_TIER_ON_RARE, UNVEIL_CHOICES, FALLBACK_PRICES } from "./recipes.js";

export const INFLUENCE_LINES = {
  "Shaper Item": "shaper", "Elder Item": "elder", "Crusader Item": "crusader",
  "Redeemer Item": "eyrie", "Hunter Item": "basilisk", "Warlord Item": "adjudicator"
};
export const INFLUENCE_NAMES = { shaper: "Shaper", elder: "Elder", crusader: "Crusader", eyrie: "Redeemer", basilisk: "Hunter", adjudicator: "Warlord" };

/* ---------------- Text helpers ---------------- */

const stripTags = s => String(s).replace(/\{[^}]*\}/g, "").trim();

export function norm(s) {
  return stripTags(s)
    .replace(/\s+Support$/i, "")
    .replace(/[+-]?\(-?\d+(?:\.\d+)?-\d+(?:\.\d+)?\)|[+-]?\d+(?:\.\d+)?/g, "#")
    .replace(/\s+/g, " ").trim().toLowerCase();
}
const exactish = s => stripTags(s).replace(/\s+Support$/i, "").replace(/\s+/g, " ").trim().toLowerCase();
const hasRange = s => /\(-?\d/.test(s);
const firstNumber = s => { const m = stripTags(s).match(/-?\d+(?:\.\d+)?/); return m ? Number(m[0]) : null; };
function rangeOf(line) {
  const m = line.match(/\((-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)\)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

export function itemClass(base) {
  if (!base) return null;
  if (base.type === "One Handed Sword" && /thrust/i.test(base.sub)) return "Thrusting One Handed Sword";
  return base.type;
}

export function weightFor(mod, tagSet) {
  for (let i = 0; i < mod.wk.length; i++) if (tagSet.has(mod.wk[i])) return mod.wv[i] || 0;
  return 0;
}

const sig = m => m.type + "|" + m.lines.map(norm).join("||");

/* ---------------- Parsing Path of Building text ---------------- */

const HEADER_KEY = /^[A-Za-z][A-Za-z ]*:\s*/;

export function parsePoB(text, data) {
  const raw = String(text || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const out = { name: "", baseName: "", base: null, influences: [], ilvl: null, quality: null, sockets: "", corrupted: false,
                idMods: [], explicit: [], warnings: [] };
  let i = 0;
  if (raw[0] && /^Rarity:/i.test(raw[0])) i = 1;

  // Base = první z prvních čtyř řádků, která je známá base
  for (let k = i; k < Math.min(raw.length, i + 4); k++) {
    const cand = raw[k].replace(/^Superior\s+/, "");
    if (data.bases[cand]) { out.baseName = cand; out.base = data.bases[cand]; out.name = k > i ? raw[k - 1] : cand; i = k + 1; break; }
  }
  if (!out.base) {
    // Magic item: base je uvnitř jména
    for (let k = i; k < Math.min(raw.length, i + 4) && !out.base; k++) {
      for (const bn of Object.keys(data.bases)) if (raw[k].includes(bn) && bn.length > out.baseName.length) { out.baseName = bn; }
      if (out.baseName) { out.base = data.bases[out.baseName]; out.name = raw[k]; i = k + 1; }
    }
  }
  if (!out.base) out.warnings.push("Nenašel jsem base item. Zkontroluj, že text začíná jménem itemu a base (tak, jak ho exportuje Path of Building).");

  let implicitsLeft = 0, seenImplicits = false;
  for (; i < raw.length; i++) {
    const l = raw[i];
    if (implicitsLeft > 0) { implicitsLeft--; continue; }
    if (INFLUENCE_LINES[l]) { out.influences.push(INFLUENCE_LINES[l]); continue; }
    let m;
    if ((m = l.match(/^Implicits:\s*(\d+)/i))) { implicitsLeft = Number(m[1]); seenImplicits = true; continue; }
    if ((m = l.match(/^(Prefix|Suffix):\s*(?:\{range:([\d.]+)\})?\s*(\S+)/i))) {
      if (m[3] !== "None") out.idMods.push({ id: m[3], side: m[1][0].toUpperCase() + m[1].slice(1).toLowerCase(), range: m[2] ? Number(m[2]) : null });
      continue;
    }
    if ((m = l.match(/^Item Level:\s*(\d+)/i))) { out.ilvl = Number(m[1]); continue; }
    if ((m = l.match(/^Quality:\s*\+?(\d+)/i))) { out.quality = Number(m[1]); continue; }
    if ((m = l.match(/^Sockets:\s*(.+)/i))) { out.sockets = m[1].trim(); continue; }
    if (/^Corrupted$/i.test(l)) { out.corrupted = true; continue; }
    if (/^-+$/.test(l)) continue;
    if (!seenImplicits && HEADER_KEY.test(l) && !/^\{/.test(l)) continue;   // Armour:, LevelReq:, Crafted: …
    if (!seenImplicits && !/^\{/.test(l) && !/\d/.test(l) && l.split(" ").length <= 4) continue; // např. „Searing Exarch Item“
    const flags = {};
    (l.match(/\{([^}]*)\}/g) || []).forEach(t => { const k = t.slice(1, -1).split(":")[0]; flags[k] = true; });
    out.explicit.push({ raw: l, text: stripTags(l), norm: norm(l), flags, used: false });
  }
  return out;
}

/* ---------------- Classification ---------------- */

// Najde pro každý řádek modu volný řádek itemu (PoB řadí řádky podle statOrder, nemusí jít po sobě).
// Vrátí indexy nebo null. Řádek `must` musí být mezi nimi.
function matchLines(cand, items, must) {
  const used = new Set(), idx = [];
  for (const line of cand.lines) {
    const n = norm(line), exact = !hasRange(line);
    let found = -1;
    for (let j = 0; j < items.length; j++) {
      const it = items[j];
      if (it.used || used.has(j) || it.norm !== n) continue;
      if (exact && exactish(line) !== exactish(it.text)) continue;
      found = j; if (j === must) break;
    }
    if (found < 0) return null;
    used.add(found); idx.push(found);
  }
  if (must != null && !idx.includes(must)) return null;
  return idx;
}

function pickTier(cands, item) {
  if (cands.length <= 1) return cands[0];
  const v = firstNumber(item.text);
  if (v != null) {
    const inside = cands.filter(c => { const r = rangeOf(c.lines[0]); return r && v >= Math.min(...r) && v <= Math.max(...r); });
    if (inside.length) return inside.sort((a, b) => b.level - a.level)[0];
  }
  return cands.slice().sort((a, b) => b.level - a.level)[0];
}

export function classify(parsed, data) {
  const base = parsed.base;
  const cls = itemClass(base);
  const tagSet = new Set(base ? base.tags : []);
  parsed.influences.forEach(inf => { if (base && base.infl[inf]) tagSet.add(base.infl[inf]); });
  const anyInflTag = new Set(base ? Object.values(base.infl) : []);
  const essenceMods = new Map();   // modId -> [essence]
  data.essences.forEach(e => { const id = cls && e.mods[cls]; if (id) { if (!essenceMods.has(id)) essenceMods.set(id, []); essenceMods.get(id).push(e); } });

  const targets = [];
  const warnings = parsed.warnings.slice();

  // 1) Mody s ID z Path of Building
  for (const im of parsed.idMods) {
    const mod = data.mods[im.id] || data.veiled[im.id];
    if (!mod) { warnings.push(`Mod ${im.id} v datech není, výpočet ho přeskočí.`); continue; }
    // označ jeho řádky jako použité
    let fractured = false;
    const idx = matchLines(mod, parsed.explicit, null);
    if (idx) idx.forEach(j => { parsed.explicit[j].used = true; if (parsed.explicit[j].flags.fractured) fractured = true; });
    targets.push(makeTarget(mod, im, fractured));
  }

  // 2) Zbylé řádky bez ID (crafted, custom, veiled …)
  const benchPool = data.master.filter(m => cls && m.types.includes(cls));
  const veiledPool = Object.values(data.veiled).filter(m => weightFor(m, tagSet) > 0);
  const essencePool = [...essenceMods.keys()].map(id => data.mods[id]).filter(Boolean);
  const explicitPool = Object.values(data.mods).filter(m => weightFor(m, tagSet) > 0);
  const items = parsed.explicit;
  for (let s = 0; s < items.length; s++) {
    if (items[s].used) continue;
    const f = items[s].flags;
    const order = f.crafted ? [["bench", benchPool], ["veiled", veiledPool]]
      : f.fractured ? [["explicit", explicitPool], ["essence", essencePool]]
      : [["veiled", veiledPool], ["essence", essencePool], ["explicit", explicitPool], ["bench", benchPool]];
    let found = null;
    for (const [kind, pool] of order) {
      const cands = pool.map(c => ({ c, idx: matchLines(c, items, s) })).filter(x => x.idx).sort((a, b) => b.c.lines.length - a.c.lines.length);
      if (cands.length) {
        const longest = cands.filter(x => x.c.lines.length === cands[0].c.lines.length);
        const mod = pickTier(longest.map(x => x.c), items[s]);
        found = { kind, mod, idx: longest.find(x => x.c === mod).idx };
        break;
      }
    }
    if (!found) { warnings.push(`Řádek „${items[s].text}“ nepoznávám (vlastní mod z PoB?), výpočet ho přeskočí.`); items[s].used = true; continue; }
    found.idx.forEach(j => { items[j].used = true; });
    const t = found.kind === "bench" ? { kind: "bench", mod: found.mod, side: found.mod.type, lines: found.mod.lines }
      : found.kind === "veiled" ? { kind: "veiled", mod: found.mod, side: found.mod.type, lines: found.mod.lines }
      : makeTarget(found.mod, { id: found.mod.id }, !!f.fractured);
    targets.push(t);
  }

  function makeTarget(mod, im, fractured) {
    if (data.veiled[mod.id]) return { kind: "veiled", mod, side: mod.type, lines: mod.lines };
    const w = weightFor(mod, tagSet);
    const needsInfl = mod.wk.find((k, i) => anyInflTag.has(k) && mod.wv[i] > 0);
    let kind = "roll", note = "";
    if (fractured) kind = "fractured";
    else if (w <= 0 && essenceMods.has(mod.id)) kind = "essence";
    else if (w <= 0 && needsInfl) {
      const inf = Object.keys(base.infl).find(k => base.infl[k] === needsInfl);
      kind = "missingInfluence"; note = INFLUENCE_NAMES[inf] || inf;
    } else if (w <= 0) kind = "impossible";
    const infl = needsInfl ? Object.keys(base.infl).find(k => base.infl[k] === needsInfl) : null;
    return { kind, mod, side: mod.type, lines: mod.lines, range: im.range, influence: infl, note };
  }

  // Kontroly
  const count = side => targets.filter(t => t.side === side && t.kind !== "unknown").length;
  if (count("Prefix") > 3) warnings.push(`Item má ${count("Prefix")} prefixy, rare jich může mít jen 3.`);
  if (count("Suffix") > 3) warnings.push(`Item má ${count("Suffix")} suffixy, rare jich může mít jen 3.`);
  const groups = new Map();
  targets.forEach(t => { const g = t.mod.group; if (g) groups.set(g, (groups.get(g) || 0) + 1); });
  groups.forEach((n, g) => { if (n > 1) warnings.push(`Dva mody ze stejné skupiny (${g}) na jednom itemu být nemohou.`); });
  if (targets.filter(t => t.kind === "bench").length > 1) warnings.push("Víc crafted modů potřebuje meta-craft „Can have up to 3 Crafted Modifiers“, který zabere suffix. Výpočet ho zatím nezahrnuje.");
  if (targets.filter(t => t.kind === "essence").length > 1) warnings.push("Item potřebuje dva mody, které jdou dostat jen z essence. Jednou essencí to nejde.");
  targets.filter(t => t.kind === "impossible").forEach(t => warnings.push(`„${t.lines.join(" / ")}“ na tuhle base nepadá.`));
  targets.filter(t => t.kind === "missingInfluence").forEach(t => warnings.push(`„${t.lines.join(" / ")}“ je ${t.note} mod, base ale ${t.note} vliv nemá. Přidej do textu řádek „${t.note} Item“.`));

  return { cls, tagSet, targets, warnings };
}

/* ---------------- Probability (exact DP over slots) ---------------- */
// targets: [{side, w, b, wt, bt}]  w = váha přijatelných tierů, b = váha ostatních tierů stejné skupiny (blokují)
// pools: {nonP, nonS, nonPt, nonSt}  váhy modů mimo skupiny cílů (t = jen s tagem pro harvest)
function rollChance({ targets, pools, startP, startS, startHit, forcedTag, needP, needS, countWeights }) {
  const n = targets.length, full = (1 << n) - 1;
  const key = (h, p, s) => h * 16 + p * 4 + s;
  let states = new Map([[key(startHit, startP, startS), 1]]);
  const step = (st, tagged) => {
    const next = new Map();
    const add = (k, v) => next.set(k, (next.get(k) || 0) + v);
    st.forEach((prob, k) => {
      const h = Math.floor(k / 16), p = Math.floor((k % 16) / 4), s = k % 4;
      const trans = [];
      let W = 0;
      const side = (sd, open) => {
        if (!open) return;
        const non = sd === "Prefix" ? (tagged ? pools.nonPt : pools.nonP) : (tagged ? pools.nonSt : pools.nonS);
        if (non > 0) { trans.push([non, h, sd]); W += non; }
        targets.forEach((t, i) => {
          if (t.side !== sd || (h & (1 << i))) return;
          const w = tagged ? t.wt : t.w, b = tagged ? t.bt : t.b;
          if (w > 0) { trans.push([w, h | (1 << i), sd]); W += w; }
          if (b > 0) { trans.push([b, -1, sd]); W += b; }
        });
      };
      side("Prefix", p < 3); side("Suffix", s < 3);
      if (W <= 0) { add(k, prob); return; }
      trans.forEach(([w, nh, sd]) => {
        if (nh < 0) return; // špatný tier zablokoval skupinu = neúspěch
        add(key(nh, sd === "Prefix" ? p + 1 : p, sd === "Suffix" ? s + 1 : s), prob * w / W);
      });
    });
    return next;
  };
  const success = st => {
    let sum = 0;
    st.forEach((prob, k) => {
      const h = Math.floor(k / 16), p = Math.floor((k % 16) / 4), s = k % 4;
      if (h === full && 3 - p >= needP && 3 - s >= needS) sum += prob;
    });
    return sum;
  };
  const total = Object.values(countWeights).reduce((a, b) => a + b, 0);
  const already = startP + startS;
  let result = 0, done = already;
  if (forcedTag) { states = step(states, true); done++; }
  for (let c = 4; c <= 6; c++) {
    while (done < c) { states = step(states, false); done++; }
    result += success(states) * (countWeights[c] || 0) / total;
  }
  return result;
}

/* ---------------- Planner ---------------- */

export function makePriceFn(prices, overrides) {
  return name => {
    if (overrides && overrides[name] != null && overrides[name] !== "") return Number(overrides[name]);
    if (prices.items && prices.items[name] != null) return prices.items[name];
    if (FALLBACK_PRICES[name] != null) return FALLBACK_PRICES[name];
    return null;
  };
}

export function basePrice(prices, name, influence, ilvl) {
  const variant = influence ? INFLUENCE_NAMES[influence] : null;
  const rows = (prices.bases || []).filter(b => b.name === name && (b.variant || null) === variant && (b.ilvl || 0) >= ilvl);
  if (!rows.length) return null;
  return rows.sort((a, b) => a.chaos - b.chaos)[0];
}

export function plan(parsed, data, opts) {
  const { cls, tagSet, targets, warnings } = classify(parsed, data);
  const price = opts.price;
  const missing = new Set();
  const cost = (name, qty = 1) => { const p = price(name); if (p == null) { missing.add(name); return null; } return p * qty; };
  const sum = (...xs) => xs.some(x => x == null) ? null : xs.reduce((a, b) => a + b, 0);

  const rollT = targets.filter(t => t.kind === "roll");
  const essT = targets.filter(t => t.kind === "essence");
  const fracT = targets.filter(t => t.kind === "fractured");
  const veilT = targets.filter(t => t.kind === "veiled");
  const benchT = targets.filter(t => t.kind === "bench");
  const blocked = targets.some(t => t.kind === "impossible" || t.kind === "missingInfluence") || essT.length > 1;

  const requiredIlvl = Math.max(0, ...targets.filter(t => ["roll", "fractured", "veiled"].includes(t.kind)).map(t => t.mod.level || 0));
  const ilvl = Math.max(opts.ilvl || parsed.ilvl || 84, requiredIlvl);

  // Pool všech modů, které na base můžou padnout
  const pool = Object.values(data.mods)
    .map(m => ({ m, w: weightFor(m, tagSet) }))
    .filter(x => x.w > 0 && x.m.level <= ilvl);

  const targetGroups = new Set(rollT.map(t => t.mod.group));
  const excluded = new Set([...fracT, ...essT].map(t => t.mod.group));

  const tInfo = rollT.map(t => {
    const s = sig(t.mod);
    const acc = pool.filter(x => x.m.group === t.mod.group && x.m.type === t.mod.type && sig(x.m) === s &&
      (opts.exactTier ? x.m.id === t.mod.id : x.m.level >= t.mod.level));
    const blk = pool.filter(x => x.m.group === t.mod.group && !acc.includes(x));
    return { t, acc, blk };
  });
  tInfo.filter(x => !x.acc.length).forEach(x => warnings.push(`„${x.t.lines.join(" / ")}“ potřebuje item level ${x.t.mod.level}+.`));

  const nonWeight = (side, tag) => pool
    .filter(x => x.m.type === side && !targetGroups.has(x.m.group) && !excluded.has(x.m.group) && (!tag || x.m.tags.includes(tag)))
    .reduce((a, x) => a + x.w, 0);
  const wsum = (arr, tag) => arr.filter(x => !tag || x.m.tags.includes(tag)).reduce((a, x) => a + x.w, 0);

  const needP = [...veilT, ...benchT].filter(t => t.side === "Prefix").length;
  const needS = [...veilT, ...benchT].filter(t => t.side === "Suffix").length;
  const fracP = fracT.filter(t => t.side === "Prefix").length;
  const fracS = fracT.filter(t => t.side === "Suffix").length;

  const chanceFor = ({ forced, tag }) => {
    let startP = fracP, startS = fracS, startHit = 0;
    const tlist = tInfo.map(x => ({ side: x.t.side, w: wsum(x.acc), b: wsum(x.blk), wt: tag ? wsum(x.acc, tag) : 0, bt: tag ? wsum(x.blk, tag) : 0 }));
    let localExcluded = null;
    if (forced) {
      const idx = tInfo.findIndex(x => x.acc.some(a => a.m.id === forced.id) || x.t.mod.id === forced.id);
      if (idx >= 0) startHit |= (1 << idx);
      else if (targetGroups.has(forced.group)) return 0; // essence dá špatný tier
      if (forced.type === "Prefix") startP++; else startS++;
      localExcluded = forced.group;
    }
    const nw = (side, t) => nonWeight(side, t) - (localExcluded && !targetGroups.has(localExcluded) && !excluded.has(localExcluded)
      ? pool.filter(x => x.m.group === localExcluded && x.m.type === side && (!t || x.m.tags.includes(t))).reduce((a, x) => a + x.w, 0) : 0);
    const pools = { nonP: nw("Prefix"), nonS: nw("Suffix"), nonPt: tag ? nw("Prefix", tag) : 0, nonSt: tag ? nw("Suffix", tag) : 0 };
    if (tag && pools.nonPt + pools.nonSt + tlist.reduce((a, t) => a + t.wt + t.bt, 0) <= 0) return 0;
    if (startP > 3 || startS > 3) return 0;
    return rollChance({ targets: tlist, pools, startP, startS, startHit, forcedTag: !!tag, needP, needS, countWeights: MOD_COUNT_WEIGHTS });
  };

  // --- Kandidátní metody
  const methods = [];
  const essList = data.essences.filter(e => cls && e.mods[cls]);
  const usefulEss = essList.filter(e => {
    const id = e.mods[cls];
    if (essT.length) return id === essT[0].mod.id;
    return tInfo.some(x => x.acc.some(a => a.m.id === id));
  });

  if (!blocked && !essT.length) {
    methods.push({ key: "chaos", name: "Chaos spam", perTry: [["Chaos Orb", 1]], setup: [["Orb of Alchemy", 1]], p: chanceFor({}) });
    HARVEST_REFORGES.forEach(h => {
      if (h.influencedOnly && !parsed.influences.length) return;
      if (!tInfo.some(x => x.acc.some(a => a.m.tags.includes(h.tag)))) return;
      methods.push({ key: "harvest:" + h.name, name: `Harvest reforge (${h.name})`, harvest: h,
        perTry: [[h.lifeforce, h.amount], ...(h.extra || [])], setup: [["Orb of Alchemy", 1]], p: chanceFor({ tag: h.tag }) });
    });
  }
  if (!blocked) {
    usefulEss.forEach(e => {
      const forced = data.mods[e.mods[cls]];
      if (!forced) return;
      const perTry = [[e.name, 1]];
      if (e.tier < ESSENCE_MIN_TIER_ON_RARE) perTry.push(["Orb of Scouring", 1]);
      methods.push({ key: "essence:" + e.name, name: `Essence spam (${e.name})`, essence: e, forced, perTry, setup: [], p: chanceFor({ forced }) });
    });
  }

  // --- Dokončení (veiled, bench)
  const veiledSteps = veilT.map(t => {
    const side = t.side;
    const vpool = Object.values(data.veiled).filter(m => m.type === side && m.level <= ilvl && weightFor(m, tagSet) > 0);
    const W = vpool.reduce((a, m) => a + weightFor(m, tagSet), 0);
    const w = weightFor(t.mod, tagSet);
    const p = W > 0 && w > 0 ? 1 - Math.pow(1 - w / W, UNVEIL_CHOICES) : 0;
    return { t, p, perTry: [["Veiled Exalted Orb", 1]] };
  });

  // --- Ceny
  const influence = parsed.influences[0] || null;
  const baseRow = parsed.base ? basePrice(opts.prices, parsed.baseName, influence, ilvl) : null;
  const baseCost = opts.baseOverride != null ? opts.baseOverride : (baseRow ? baseRow.chaos : null);
  if (baseCost == null) missing.add(`Base: ${parsed.baseName}${influence ? " (" + INFLUENCE_NAMES[influence] + ")" : ""}`);

  const listCost = list => sum(...list.map(([n, q]) => cost(n, q)));
  const finishCost = sum(0, ...veiledSteps.map(v => { const c = cost("Veiled Exalted Orb"); return v.p > 0 && c != null ? c / v.p : null; }));

  methods.forEach(m => {
    m.attempts = m.p > 0 ? 1 / m.p : Infinity;
    m.tryCost = listCost(m.perTry);
    m.setupCost = listCost(m.setup);
    m.rollCost = m.p > 0 && m.tryCost != null ? m.tryCost * m.attempts : null;
    m.total = m.p > 0 ? sum(baseCost, m.setupCost, m.rollCost, finishCost) : null;
    m.n50 = m.p > 0 && m.p < 1 ? Math.ceil(Math.log(0.5) / Math.log(1 - m.p)) : 1;
    m.n90 = m.p > 0 && m.p < 1 ? Math.ceil(Math.log(0.1) / Math.log(1 - m.p)) : 1;
  });
  methods.sort((a, b) => {
    if (a.p <= 0 !== b.p <= 0) return a.p <= 0 ? 1 : -1;
    if (a.total != null && b.total != null) return a.total - b.total;
    if (a.total == null !== (b.total == null)) return a.total == null ? 1 : -1;
    return b.p - a.p;
  });

  // Bez náhodného rerollu (všechno je fractured/veiled/bench)
  const noRoll = !rollT.length && !essT.length;

  return {
    parsed, cls, targets, warnings, ilvl, requiredIlvl, influence, baseRow, baseCost,
    methods: methods.filter(m => m.p > 0), impossibleMethods: methods.filter(m => m.p <= 0),
    veiledSteps, benchT, fracT, rollT, essT, noRoll, blocked, missing: [...missing], finishCost
  };
}
