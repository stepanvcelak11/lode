# Lodě ⚓

Mobilní (webová) verze strategické hry **Lodě** – námořní bitva pro dva hráče s pevninou, stavbami, děly, majáky, minami a bonusy. Pravidla jsou v souboru [PRAVIDLA.md](PRAVIDLA.md) a zobrazují se i přímo ve hře.

## Co hra umí (verze 0.3)

- Plocha 24 × 19 (řádky A–R včetně CH), editor rozmístění s kontrolou všech pravidel a tlačítkem „Náhodně“.
- Všechny lodě, stavby, ostrovy, majáky, speciální políčko, miny a vlastní tvar ULO i jeho střely.
- Kompletní průběh tahu s kostkami: voda/pevnina, výběr lodě, děla, naváděné střely, devítky, sonary, hledač, základna, bunkr, vzdušná obrana a všechny bonusy.
- Záznamník (jako papírová tabulka) a deník tahů.
- **Hra proti počítači** ve třech obtížnostech (lehká, střední, těžká) s nastavitelnou rychlostí; počítač před výstřelem ukáže, kam míří, a po jeho tahu se zobrazí shrnutí.
- **Dva hráči na jednom zařízení** (s obrazovkou „předej telefon“ a shrnutím soupeřova tahu).
- Logický editor: stavby jen na pevninu, okamžité kontroly pravidel, kreslení pevniny tahem prstu.
- Hra se průběžně ukládá a funguje i bez internetu; dá se nainstalovat na plochu telefonu (PWA).

## Spuštění

Hra nepotřebuje žádnou instalaci ani sestavení – stačí ji servírovat jako statické soubory:

```bash
npm start            # http://localhost:8080
# nebo
python3 -m http.server 8080
```

Testy herní logiky:

```bash
npm test
```

### Na telefonu

Po zapnutí GitHub Pages (Settings → Pages → Source: **GitHub Actions**) se hra po každém pushi do `main` nasadí na `https://<uživatel>.github.io/lode/`. V telefonu stačí stránku otevřít a v prohlížeči zvolit **Přidat na plochu** – pak se spouští jako normální aplikace.

## Struktura

```
index.html, styles.css         – stránka a vzhled
src/engine/                    – herní logika (bez závislosti na prohlížeči)
  constants.js                 – rozměry, lodě, stavby, tabulky kostek, bonusy
  geometry.js                  – souřadnice, tvary, vzdálenosti
  layout.js                    – rozmístění, kontrola pravidel, náhodné rozmístění
  game.js                      – průběh hry (stavový automat, dispatch akcí)
  bot.js                       – počítačový hráč
src/ui/                        – uživatelské rozhraní (editor, hra, plocha)
test/                          – testy (node --test)
PRAVIDLA.md                    – pravidla včetně míst, která bylo nutné domyslet
```

## Další kroky

- Doladit pravidla podle otevřených otázek na konci [PRAVIDLA.md](PRAVIDLA.md).
- Online hra dvou hráčů na různých telefonech (server, např. Firebase/Supabase).
- Chytřejší počítačový soupeř, zvuky a animace.
- Zabalení do aplikace pro Google Play / App Store (např. Capacitor).
