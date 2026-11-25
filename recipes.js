// Pravidla craftu, která engine používá. Tady se dají upravit bez zásahu do výpočtu.
// Všechno, co je označené „OVĚŘ“, je převzaté z wiki/poedb a po patchi se to může lišit.

// Kolik modů dostane rare item po reforge (Chaos Orb, essence, harvest reforge).
// Váhy 8 : 3 : 1 pro 4 : 5 : 6 modů. OVĚŘ
export const MOD_COUNT_WEIGHTS = { 4: 8, 5: 3, 6: 1 };

// Harvest reforge „Reforge a Rare item with random modifiers, including a X modifier“.
// tag = modTag z dat Path of Building, lifeforce = typ a množství. OVĚŘ ceny po 3.30.
export const HARVEST_REFORGES = [
  { name: "Fire",      tag: "fire",           lifeforce: "Wild Crystallised Lifeforce",   amount: 50 },
  { name: "Cold",      tag: "cold",           lifeforce: "Vivid Crystallised Lifeforce",  amount: 50 },
  { name: "Lightning", tag: "lightning",      lifeforce: "Primal Crystallised Lifeforce", amount: 50 },
  { name: "Physical",  tag: "physical",       lifeforce: "Vivid Crystallised Lifeforce",  amount: 50 },
  { name: "Life",      tag: "life",           lifeforce: "Wild Crystallised Lifeforce",   amount: 75 },
  { name: "Defence",   tag: "defences",       lifeforce: "Primal Crystallised Lifeforce", amount: 75 },
  { name: "Attack",    tag: "attack",         lifeforce: "Wild Crystallised Lifeforce",   amount: 75 },
  { name: "Caster",    tag: "caster",         lifeforce: "Primal Crystallised Lifeforce", amount: 75 },
  { name: "Chaos",     tag: "chaos",          lifeforce: "Vivid Crystallised Lifeforce",  amount: 100 },
  { name: "Speed",     tag: "speed",          lifeforce: "Vivid Crystallised Lifeforce",  amount: 150 },
  { name: "Critical",  tag: "critical",       lifeforce: "Primal Crystallised Lifeforce", amount: 150 },
  { name: "Influence", tag: "influence_mod",  lifeforce: "Primal Crystallised Lifeforce", amount: 5000,
    extra: [["Sacred Crystallised Lifeforce", 1]], influencedOnly: true }
];

// Essence nižší úrovně než tato nejde použít na rare item, mezi pokusy je tedy potřeba Orb of Scouring. OVĚŘ
// (1 Whispering … 5 Screaming, 6 Shrieking, 7 Deafening, 8 speciální jako Horror nebo Delirium)
export const ESSENCE_MIN_TIER_ON_RARE = 6;

// Kolik možností nabízí Jun při unveilu (Veiled Exalted / Veiled Chaos).
export const UNVEIL_CHOICES = 3;

// Náhradní ceny (v chaos) pro věci, které poe.ninja neuvádí.
export const FALLBACK_PRICES = {
  "Chaos Orb": 1
};

// Tipy k base, zobrazí se v kroku „Kup base“.
export const BASE_TIPS = {
  memoryStrands: "Pokud seženeš base s Memory Strands, každý reforge má o něco vyšší tiery. Výpočet s tím nepočítá, takže šance budou ve skutečnosti spíš lepší."
};
