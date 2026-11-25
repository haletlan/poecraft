import { parsePoB, plan, makePriceFn, INFLUENCE_NAMES } from "./engine.js";
import { BASE_TIPS, ESSENCE_MIN_TIER_ON_RARE, UNVEIL_CHOICES } from "./recipes.js";

const $ = id => document.getElementById(id);
const itemEl = $("item"), resultEl = $("result"), goBtn = $("go");
let DATA = null, PRICES = null, last = null, selectedKey = null;

/* ---------- small helpers ---------- */
function el(tag, attrs, kids) {
  const n = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "text") n.textContent = String(v);
    else if (k === "cls") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : String(v));
  }
  (Array.isArray(kids) ? kids : [kids]).forEach(c => { if (c != null && c !== false) n.append(typeof c === "string" ? document.createTextNode(c) : c); });
  return n;
}
const load = (k, f) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const fmt = (n, d = 1) => n == null || !isFinite(n) ? "?" : Number(n).toLocaleString("cs-CZ", { maximumFractionDigits: d });
function money(chaos) {
  if (chaos == null || !isFinite(chaos)) return "cena neznámá";
  const div = PRICES.divine || 0;
  if (div && chaos >= div) return `≈ ${fmt(chaos / div, 1)} div`;
  return `≈ ${fmt(chaos, chaos < 10 ? 1 : 0)} c`;
}
const odds = p => p >= 1 ? "jistota" : `1 : ${fmt(1 / p, 0)}`;
const modText = t => t.lines.map(l => l.replace(/\s+Support$/i, "")).join(" / ");

const SOURCE = {
  roll: "náhodný reroll", essence: "jen z essence", veiled: "veiled (Jun)", bench: "crafting bench",
  fractured: "fractured", impossible: "nejde na tuhle base", missingInfluence: "chybí vliv"
};

/* ---------- init ---------- */
async function init() {
  const getJson = async url => {
    let r;
    try { r = await fetch(url, { cache: "no-cache" }); }
    catch (e) { throw new Error(`${url} se nepodařilo stáhnout (${e.message}). Pokud stránku otevíráš přímo ze souboru, spusť ji přes lokální server (viz README).`); }
    if (!r.ok) throw new Error(`${url} vrátil chybu ${r.status}. Soubor v repozitáři chybí nebo je jinde než vedle index.html.`);
    try { return await r.json(); }
    catch (e) { throw new Error(`${url} není platný JSON (${e.message}).`); }
  };
  try {
    $("meta").textContent = "Načítám mody a ceny…";
    const [d, p] = await Promise.all([getJson("data/pob.json"), getJson("data/prices.json")]);
    DATA = d; PRICES = p;
  } catch (e) {
    window.__kovarnaShow ? window.__kovarnaShow(e.message) : resultEl.replaceChildren(el("div", { cls: "err", text: e.message }));
    return;
  }
  window.__kovarnaReady = true;
  const upd = new Date(PRICES.updated);
  $("meta").textContent = `Liga ${PRICES.league}, ceny ${isNaN(upd) ? "?" : upd.toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}, data PoB ${DATA.version || "?"}`;
  const draft = load("kovarna:draft", {});
  itemEl.value = draft.item || "";
  $("ilvl").value = draft.ilvl || "";
  $("higher").checked = draft.higher !== false;
  goBtn.disabled = false;
  renderEmpty();
  if (itemEl.value.trim()) run();
}

function saveDraft() { save("kovarna:draft", { item: itemEl.value, ilvl: $("ilvl").value, higher: $("higher").checked }); }
itemEl.addEventListener("input", saveDraft);
$("ilvl").addEventListener("input", saveDraft);
$("higher").addEventListener("change", () => { saveDraft(); if (last) run(); });
goBtn.addEventListener("click", () => { selectedKey = null; run(); });

function renderEmpty() {
  resultEl.replaceChildren(el("div", { cls: "empty" }, [
    el("h2", { text: "Jak na to" }),
    el("p", { text: "V Path of Building si item poskládej v Crafteru (nebo otevři hotový), zkopíruj ho přes Ctrl+C a vlož vlevo. Kovárna rozpozná mody podle ID, zjistí odkud se dají dostat a spočítá, která cesta vyjde nejlevněji." }),
    el("p", { text: "Mody označené {custom} rozpozná podle textu: veiled mody od Juna, essence mody a cokoli z crafting benche." })
  ]));
}

/* ---------- run ---------- */
function run() {
  if (!DATA) return;
  const text = itemEl.value.trim();
  if (!text) { renderEmpty(); return; }
  const overrides = load("kovarna:overrides", {});
  const parsed = parsePoB(text, DATA);
  if (!parsed.base) { resultEl.replaceChildren(el("div", { cls: "err", text: parsed.warnings[0] })); return; }
  const ilvl = Number($("ilvl").value) || null;
  const baseKey = `Base: ${parsed.baseName}${parsed.influences[0] ? " (" + INFLUENCE_NAMES[parsed.influences[0]] + ")" : ""}`;
  last = plan(parsed, DATA, {
    price: makePriceFn(PRICES, overrides), prices: PRICES, ilvl, exactTier: !$("higher").checked,
    baseOverride: overrides[baseKey] != null && overrides[baseKey] !== "" ? Number(overrides[baseKey]) : null
  });
  render(last);
}

/* ---------- render ---------- */
function render(r) {
  const p = r.parsed;
  const out = [];

  // Tooltip
  const infl = r.influence ? INFLUENCE_NAMES[r.influence] : null;
  out.push(el("div", { cls: "tip" }, [
    el("div", { cls: "tip-head" }, [
      el("div", { cls: "name", text: p.name || p.baseName }),
      el("div", { cls: "sub", text: [p.baseName, infl ? infl + " item" : null, `item level ${r.ilvl}`].filter(Boolean).join(", ") })
    ]),
    el("div", { cls: "tip-body" }, [
      el("ul", { cls: "mods" }, r.targets.map(t => el("li", { cls: "k-" + t.kind }, [
        modText(t), el("i", { cls: "src", text: `${t.side === "Prefix" ? "prefix" : "suffix"}, ${SOURCE[t.kind] || t.kind}` })
      ]))),
      r.requiredIlvl ? el("p", { cls: "hint", style: "text-align:center", text: `Nejvyšší tier na itemu potřebuje item level ${r.requiredIlvl}.` }) : null
    ])
  ]));

  if (r.warnings.length) out.push(el("div", { cls: "warn" }, [el("strong", { text: "Pozor" }), el("ul", null, r.warnings.map(w => el("li", { text: w })))]));

  if (r.blocked) { out.push(el("p", { text: "Takový item v téhle podobě vycraftit nejde, uprav ho podle upozornění výše." })); resultEl.replaceChildren(...out); return; }

  const methods = r.methods;
  if (!methods.length && !r.noRoll) {
    out.push(el("div", { cls: "err", text: "Žádná z metod (Chaos, essence, harvest) nedokáže tuhle kombinaci trefit. Zkontroluj item level a upozornění." }));
    resultEl.replaceChildren(...out); return;
  }
  const m = methods.find(x => x.key === selectedKey) || methods[0] || null;

  // Verdict
  const total = m ? m.total : r.baseCost != null && r.finishCost != null ? r.baseCost + r.finishCost : null;
  out.push(el("div", { cls: "verdict" }, [
    el("div", { cls: "cost", text: total != null ? money(total).replace("≈ ", "≈ ") : "?" }),
    el("div", { cls: "what" }, [m && m === methods[0] ? "Nejlevnější cesta" : "Vybraná cesta", el("br"), el("strong", { text: m ? m.name : "Bez rerollu" })]),
    m ? el("div", { cls: "facts", text: `Šance na pokus ${odds(m.p)}, průměrně ${fmt(m.attempts, 0)} pokusů, 90 % craftů skončí do ${fmt(m.n90, 0)} pokusů.` }) : null
  ]));
  if (total == null) out.push(el("p", { cls: "hint", text: "Celkovou cenu nejde spočítat, protože chybí některé ceny. Doplň je dole a recept se přepočítá." }));

  // Steps
  out.push(el("h3", { cls: "sec", text: "Recept" }));
  out.push(el("ol", { cls: "steps" }, buildSteps(r, m)));

  // Comparison
  if (methods.length > 1) {
    out.push(el("h3", { cls: "sec", text: "Porovnání metod" }));
    out.push(el("p", { cls: "hint", style: "margin-top:-4px;margin-bottom:8px", text: "Klikni na řádek a recept se přepne na danou metodu." }));
    const rows = methods.slice(0, 12).map(x => el("tr", { cls: "pick" + (x === m ? " sel" : ""), tabindex: "0",
      onclick: () => { selectedKey = x.key; render(r); },
      onkeydown: e => { if (e.key === "Enter") { selectedKey = x.key; render(r); } } }, [
      el("td", { text: x.name }),
      el("td", { cls: "n", text: odds(x.p) }),
      el("td", { cls: "n", text: fmt(x.attempts, 0) }),
      el("td", { cls: "n", text: x.tryCost != null ? money(x.tryCost) : "?" }),
      el("td", { cls: "n", text: x.total != null ? money(x.total) : "?" })
    ]));
    out.push(el("div", { cls: "tbl-wrap" }, el("table", null, [
      el("thead", null, el("tr", null, ["Metoda", "Šance", "Pokusů", "Pokus", "Celkem"].map(h => el("th", { scope: "col", text: h })))),
      el("tbody", null, rows)
    ])));
  }

  // Missing prices
  if (r.missing.length) {
    out.push(el("h3", { cls: "sec", text: "Chybějící ceny" }));
    out.push(el("p", { cls: "hint", style: "margin-top:-4px", text: "poe.ninja tyhle položky v datech nemá (nebo ještě neproběhla aktualizace). Doplň cenu v chaos, uloží se v tomhle prohlížeči." }));
    const ov = load("kovarna:overrides", {});
    const grid = el("div", { cls: "missing" });
    r.missing.forEach(name => {
      const input = el("input", { cls: "num", type: "text", inputmode: "decimal", placeholder: "chaos", "aria-label": `Cena ${name}`, value: ov[name] ?? "" });
      input.addEventListener("change", () => {
        const o = load("kovarna:overrides", {});
        const v = input.value.trim().replace(",", ".");
        if (v === "" || !isFinite(Number(v))) delete o[name]; else o[name] = Number(v);
        save("kovarna:overrides", o); run();
      });
      grid.append(el("span", { text: name }), input);
    });
    out.push(grid);
  }

  resultEl.replaceChildren(...out);
}

/* ---------- recipe text ---------- */
function step(title, body, extra) {
  return el("li", null, [el("div", { cls: "st-title", text: title }), body ? el("p", { cls: "st-body", text: body }) : null, ...(extra || [])]);
}
const list = items => el("ul", { cls: "st-list" }, items.map(t => el("li", { text: t })));

function buildSteps(r, m) {
  const p = r.parsed, steps = [];
  const infl = r.influence ? INFLUENCE_NAMES[r.influence] : null;

  // 1. Base
  const frac = r.fracT.map(modText);
  const baseTitle = `Kup ${p.baseName}${infl ? ` s vlivem ${infl}` : ""}, item level ${r.ilvl}+`;
  const baseBody = [
    frac.length ? `Base musí mít fractured: ${frac.join("; ")}.` : "",
    r.baseCost != null ? `Na trhu ${money(r.baseCost)}${r.baseRow ? ` (poe.ninja, ilvl ${r.baseRow.ilvl})` : ""}.` : "Cenu base poe.ninja nezná, zjisti ji na trade a doplň dole."
  ].filter(Boolean).join(" ");
  steps.push(step(baseTitle, baseBody, [el("p", { cls: "st-note", text: BASE_TIPS.memoryStrands })]));

  // 2. Reroll
  if (m) {
    const want = r.rollT.map(t => `${modText(t)}${$("higher").checked ? " (tenhle tier nebo vyšší)" : " (přesně tenhle tier)"}`);
    if (r.essT.length) want.unshift(`${modText(r.essT[0])} (dá ho essence)`);
    const free = [];
    const needP = [...r.veiledSteps.map(v => v.t), ...r.benchT].filter(t => t.side === "Prefix").length;
    const needS = [...r.veiledSteps.map(v => v.t), ...r.benchT].filter(t => t.side === "Suffix").length;
    if (needP) free.push(`${needP}× volný prefix`);
    if (needS) free.push(`${needS}× volný suffix`);
    const stopList = list([...want, ...(free.length ? [`a zároveň ${free.join(" a ")} na dokončení`] : [])]);
    const stats = el("p", { cls: "st-stats", text: `Šance na pokus ${odds(m.p)}. Průměrně ${fmt(m.attempts, 0)} pokusů, polovina craftů skončí do ${fmt(m.n50, 0)}, 90 % do ${fmt(m.n90, 0)}. Cena rerollu ${money(m.rollCost)}.` });

    if (m.key === "chaos") {
      steps.push(step("Udělej z ní rare", "Orb of Alchemy (nebo Orb of Transmutation a Regal Orb)."));
      steps.push(step("Chaos Orb, dokud item nemá:", null, [stopList, stats]));
    } else if (m.harvest) {
      const h = m.harvest;
      steps.push(step("Udělej z ní rare", "Harvest reforge jde jen na rare item, takže nejdřív Orb of Alchemy."));
      steps.push(step(`Harvest: Reforge including a ${h.name} modifier`,
        `Na Horticrafting Station vyber „Reforge a Rare item with random modifiers, including a ${h.name} modifier“ (${h.amount}× ${h.lifeforce}${h.extra ? ", " + h.extra.map(([n, q]) => q + "× " + n).join(", ") : ""}). Opakuj, dokud item nemá:`,
        [stopList, stats]));
    } else if (m.essence) {
      const e = m.essence;
      const lowTier = e.tier < ESSENCE_MIN_TIER_ON_RARE;
      steps.push(step(`Spamuj ${e.name}`,
        `Essence vždy přidá „${modText(m.forced)}“, zbytek modů je náhodný.${lowTier ? " Tahle úroveň essence jde jen na normal item, takže po každém neúspěchu Orb of Scouring." : " Funguje na white i na rare base."} Opakuj, dokud item nemá:`,
        [stopList, stats]));
    }
  }

  // 3. Veiled
  r.veiledSteps.forEach(v => {
    steps.push(step(`Veiled Exalted Orb a unveil: ${modText(v.t)}`,
      `Veiled Exalted Orb přidá skrytý mod, u Juna ho odhal a vyber „${modText(v.t)}“. Jun nabízí ${UNVEIL_CHOICES} možnosti, tahle se objeví ${v.p > 0 ? `zhruba v jednom z ${fmt(1 / v.p, 0)} pokusů` : "na tuhle base vůbec"}.`,
      [el("p", { cls: "st-note", text: "Pokud se nabídka nepovede, veiled mod musíš z itemu dostat pryč (meta-craft a Orb of Scouring nebo Annul). Výpočet zatím počítá jen s cenou Veiled Exalted Orb. Když je volný prefix i suffix, veiled mod může skončit na špatné straně." })]));
  });

  // 4. Bench
  r.benchT.forEach(t => steps.push(step(`Crafting bench: ${modText(t)}`, "Nacrafti na benchi. Recept musíš mít odemčený (unveiled mody se učí odhalením u Juna).")));

  // 5. Quality, sockets, divine
  if (p.quality) {
    const cls = r.cls || "";
    const cur = /Ring|Amulet|Belt/.test(cls) ? "katalyst podle modů, které chceš zesílit"
      : /Body|Helmet|Gloves|Boots|Shield|Quiver/.test(cls) ? "Armourer's Scrap" : "Blacksmith's Whetstone";
    steps.push(step(`Quality ${p.quality} %`, `Dorovnej quality (${cur}).`));
  }
  if (p.sockets) steps.push(step(`Sokety ${p.sockets}`, "Počet a barvy soketů udělej na crafting benchi, nebo Jeweller's, Fusing a Chromatic Orb."));
  if (r.targets.some(t => t.range != null && t.range >= 0.8)) steps.push(step("Divine Orb na vysoké rolly", "Některé mody chceš blízko maxima tieru. Divine Orb přeroluje čísla, mody nechá."));
  return steps;
}

init();
