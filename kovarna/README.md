# Kovárna

Statická stránka pro GitHub Pages, která z itemu vloženého z **Path of Building** sestaví recept na craft krok za krokem: jakou base koupit, čím rerollovat, kdy přestat, co dodělat na benchi a kolik to průměrně stojí. Bez AI: počítá se jen z dat hry a cen.

## Jak to funguje

1. **Rozbor itemu.** Mody s ID (`Prefix: {range:0.94}AreaOfEffectSupportedUber3`) se dohledají přímo v datech Path of Building. Řádky bez ID (`{crafted}`, `{custom}`) se poznají podle textu: veiled mody od Juna, essence mody a crafty z benche.
2. **Zdroj každého modu.** Náhodný reroll, jen z essence, veiled, bench, fractured. Engine hlídá i nemožné kombinace (mod na base nepadá, chybí vliv, dva mody ze stejné skupiny, víc než 3 prefixy).
3. **Pravděpodobnost.** Pro Chaos spam, každou použitelnou essenci a každý harvest reforge („including a X modifier“) se spočítá přesná šance na jeden pokus. Výpočet jde přes všechny stavy slotů (prefix/suffix), bere váhy modů z dat, počet modů 4/5/6 v poměru 8:3:1, blokování skupiny špatným tierem a místo, které musí zůstat volné pro veiled a bench mody.
4. **Cena.** Pokusy × cena pokusu + base + dokončení. Metody se seřadí od nejlevnější.

## Nasazení na GitHub Pages

1. Vytvoř repozitář a nahraj do něj obsah téhle složky (včetně `.github` a `.nojekyll`).
2. **Settings → Pages:** Source „Deploy from a branch“, větev `main`, složka `/ (root)`.
3. **Settings → Actions → General → Workflow permissions:** zapni „Read and write permissions“, aby mohla Action ukládat data.
4. **Actions → Aktualizace cen a dat → Run workflow.** Tím se poprvé stáhnou ceny z poe.ninja a čerstvá data z Path of Building. Dál to běží samo každých 6 hodin.
5. Volitelně **Settings → Secrets and variables → Actions → Variables:** proměnná `LEAGUE` s přesným jménem ligy, kdyby automatické zjištění ligy nefungovalo.

V repozitáři je zatím jen ruční snímek cen. Essence, lifeforce a base doplní až první běh Action, do té doby je stránka nabídne k ručnímu vyplnění.

## Lokální spuštění

Prohlížeč nenačte data přes `file://`, takže stránku spusť přes server:

```
python -m http.server 8000
```

a otevři http://localhost:8000.

## Úpravy pravidel

Všechno, co se dá upravit bez zásahu do výpočtu, je v `js/recipes.js`: ceny a typy lifeforce pro harvest reforge, poměr počtu modů, od jaké úrovně jde essence na rare, počet možností při unveilu. Hodnoty označené „OVĚŘ“ jsou převzaté z wiki a po patchi se můžou lišit.

## Co engine zatím neumí

- Vícekrokové postupy: zamknout prefixy nebo suffixy meta-craftem, Orb of Scouring a pak doplnit Exalted Orbem. U itemů s mnoha cílenými mody je proto jednokrokový reroll často nereálně drahý a ve skutečnosti se craftí jinak.
- Fossily, Alteration spam, Eldritch currency, recombinator, beastcrafty, Awakener's Orb.
- Memory Strands a Item Tier (od 3.30) zvyšují tiery. Výpočet s nimi nepočítá, takže reálné šance budou spíš lepší.
- U veiled modů počítá jen cenu Veiled Exalted Orb, ne odstranění nepovedeného modu.

## Zdroje dat

- Mody, base, essence, veiled mody a bench: [Path of Building Community](https://github.com/PathOfBuildingCommunity/PathOfBuilding) (`src/Data`, převod skriptem `tools/build_data.py`). Data hry © Grinding Gear Games.
- Ceny: [poe.ninja](https://poe.ninja) přes `tools/fetch_prices.py`.

Neoficiální nástroj, není spojený s Grinding Gear Games.
