// Modulo regole D&D 5e/2024 (separato dal resto dell'app).
// Fonti e stato di verifica sono dichiarati in RULES_SOURCES: nulla viene presentato come "verificato" se non lo è.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const CREATURE_FILE = path.join(here, "..", "data", "srd52-creatures.json");

export const RULES_VERSION = "srd-5.2 (2024)";

export const RULES_SOURCES = {
  creatures: {
    what: "Nome, tipo, taglia, GS, PE, CA e PF delle creature",
    source: "System Reference Document 5.2 via Open5e API v2 (documento srd-2024)",
    license: "CC BY 4.0 - © Wizards of the Coast LLC",
    verified: true,
    note: "Importati con tools/fetch-srd.mjs; nessun valore inserito a mano.",
  },
  encounterBudget: {
    what: "Budget di PE per incontro (Basso/Moderato/Alto) per livello",
    source: "System Reference Document 5.2, 'Combat Encounters' — tabella 'XP Budget per Character'",
    license: "CC BY 4.0 - © Wizards of the Coast LLC (solo valori numerici, nessun testo copiato)",
    verified: true,
    note: "Verificato il 2026-10-17 sul PDF ufficiale SRD_CC_v5.2 (media.dndbeyond.com): tutti i 60 valori (livelli 1-20 × Basso/Moderato/Alto) coincidono.",
  },
  xpToLevel: {
    what: "PE necessari per raggiungere ogni livello",
    source: "System Reference Document 5.2, 'Character Creation' — tabella 'Character Advancement'",
    license: "CC BY 4.0 - © Wizards of the Coast LLC (solo valori numerici)",
    verified: true,
    note: "Verificato il 2026-10-17: i 20 valori coincidono con la tabella SRD 5.2 pubblicata su 5e24srd.com; dal PDF ufficiale il testo estratto conferma i valori leggibili (0, 300, 900, 2.700, 23.000, 100.000, 120.000); gli altri non erano estraibili dal PDF.",
  },
  traps: {
    what: "CD del tiro salvezza e danni delle trappole nei dungeon generati",
    source: "System Reference Document 5.2, 'Traps' — scala 'At Higher Levels' delle trappole letali (es. Collapsing Roof)",
    license: "CC BY 4.0 - © Wizards of the Coast LLC (solo valori numerici)",
    verified: true,
    note: "Verificato il 2026-10-17 sul PDF ufficiale: livelli 1-4 CD 13, 11 (2d10); 5-10 CD 15, 22 (4d10); 11-16 CD 17, 55 (10d10); 17-20 CD 19, 99 (18d10). Le descrizioni delle trappole sono originali.",
  },
  checkDcs: {
    what: "CD delle prove per trovare indizi ed enigmi",
    source: "Scelte del generatore (CD 10-14) all'interno della scala delle CD tipiche dell'SRD 5.2 (facile 10, media 15, difficile 20)",
    license: "Originale",
    verified: false,
    note: "Non sono valori di regole: il DM può adattarle. La scala delle CD tipiche dell'SRD è citata solo come riferimento.",
  },
};

// PE budget per personaggio: [Basso, Moderato, Alto]
export const XP_BUDGET = {
  1: [50, 75, 100], 2: [100, 150, 200], 3: [150, 225, 400], 4: [250, 375, 500], 5: [500, 750, 1100],
  6: [600, 1000, 1400], 7: [750, 1300, 1700], 8: [1000, 1700, 2100], 9: [1300, 2000, 2600], 10: [1600, 2300, 3100],
  11: [1900, 2900, 4100], 12: [2200, 3700, 4700], 13: [2600, 4200, 5400], 14: [2900, 4900, 6200], 15: [3300, 5400, 7800],
  16: [3800, 6100, 9800], 17: [4500, 7200, 11700], 18: [5000, 8700, 14200], 19: [5500, 10700, 17200], 20: [6400, 13200, 22000],
};

// PE totali per raggiungere il livello N (indice = livello).
export const XP_TO_LEVEL = [0, 0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];

export const DIFFICULTIES = ["bassa", "moderata", "alta"];

export const proficiencyBonus = (level) => 2 + Math.floor((clampLevel(level) - 1) / 4);
export const clampLevel = (l) => Math.min(20, Math.max(1, Math.trunc(l) || 1));

export function encounterBudget(level, players, difficulty = "moderata") {
  const i = DIFFICULTIES.indexOf(difficulty);
  if (i < 0) throw new Error(`Difficoltà sconosciuta: ${difficulty}`);
  if (!Number.isInteger(players) || players < 1) throw new Error("Numero di giocatori non valido");
  return XP_BUDGET[clampLevel(level)][i] * players;
}

/** PE totali che il gruppo accumula tra livello iniziale e finale (stima per la durata della campagna). */
export function xpSpan(startLevel, endLevel) {
  return XP_TO_LEVEL[clampLevel(endLevel)] - XP_TO_LEVEL[clampLevel(startLevel)];
}

let cache = null;
export function loadCreatures() {
  if (cache) return cache;
  if (!fs.existsSync(CREATURE_FILE)) throw new Error(`Dati creature SRD mancanti: ${CREATURE_FILE}. Esegui: node tools/fetch-srd.mjs`);
  cache = JSON.parse(fs.readFileSync(CREATURE_FILE, "utf8"));
  return cache;
}
export const creatureTypes = () => [...new Set(loadCreatures().creatures.map((c) => c.type))].sort();
export function findCreature(key) { return loadCreatures().creatures.find((c) => c.key === key) ?? null; }

export function searchCreatures({ q, type, minCr, maxCr, limit = 100 } = {}) {
  let list = loadCreatures().creatures;
  if (q) list = list.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  if (type) list = list.filter((c) => c.type === type);
  if (minCr !== undefined && minCr !== "") list = list.filter((c) => c.cr >= Number(minCr));
  if (maxCr !== undefined && maxCr !== "") list = list.filter((c) => c.cr <= Number(maxCr));
  return list.slice(0, limit);
}

const fmtCr = (c) => (c === 0.125 ? "1/8" : c === 0.25 ? "1/4" : c === 0.5 ? "1/2" : String(c));

/**
 * Compone un incontro la cui somma di PE non supera il budget (metodo 2024: somma dei PE, nessun moltiplicatore).
 * Deterministico per un dato rng. `types` restringe il tipo di creatura (tema); `boss` ammette creature leggendarie.
 */
export function buildEncounter(rng, { level, players, difficulty = "moderata", types, boss = false, maxCreatures = 8 }) {
  const budget = encounterBudget(level, players, difficulty);
  let pool = loadCreatures().creatures.filter((c) => c.xp > 0 && c.xp <= budget && (boss || !c.legendary));
  if (types?.length) {
    const themed = pool.filter((c) => types.includes(c.type));
    if (themed.length >= 3) pool = themed;
  }
  if (!pool.length) throw new Error(`Nessuna creatura SRD entro budget ${budget} PE`);
  // Creatura principale: la più costosa tra quelle che stanno nel budget con almeno ~1/6 del budget (evita orde banali);
  // per un boss si cerca di spendere almeno metà del budget in una sola creatura.
  const minMain = boss ? budget * 0.5 : budget / 6;
  let mains = pool.filter((c) => c.xp >= minMain);
  if (!mains.length) mains = [pool.reduce((a, b) => (b.xp > a.xp ? b : a))];
  const main = rng.pick(mains);
  const group = [{ c: main, n: 1 }];
  let spent = main.xp;
  if (!boss) {
    while (spent + main.xp <= budget && group[0].n < maxCreatures) { group[0].n++; spent += main.xp; }
  }
  // Riempie l'avanzo con creature più piccole dello stesso insieme.
  const fillers = pool.filter((c) => c.xp <= budget - spent && c.key !== main.key).sort((a, b) => b.xp - a.xp);
  let total = group.reduce((s, g) => s + g.n, 0);
  while (fillers.length && total < maxCreatures) {
    const f = fillers.find((c) => c.xp <= budget - spent);
    if (!f) break;
    const existing = group.find((g) => g.c.key === f.key);
    if (existing) existing.n++; else group.push({ c: f, n: 1 });
    spent += f.xp; total++;
    if (rng.chance(0.35)) break;
  }
  return {
    difficulty, budget, totalXp: spent, level, players,
    creatures: group.map((g) => ({ key: g.c.key, name: g.c.name, count: g.n, cr: fmtCr(g.c.cr), xp: g.c.xp, ac: g.c.ac, hp: g.c.hp, type: g.c.type })),
    source: "SRD 5.2 (CC BY 4.0): creature e budget di PE per personaggio",
  };
}

// Scala delle trappole letali dell'SRD 5.2 (esempio "Collapsing Roof" e sezione "At Higher Levels"): fasce di livello 1-4, 5-10, 11-16, 17-20.
const TRAP_TIERS = [
  { min: 1, max: 4, dc: 13, damage: "11 (2d10)" }, { min: 5, max: 10, dc: 15, damage: "22 (4d10)" },
  { min: 11, max: 16, dc: 17, damage: "55 (10d10)" }, { min: 17, max: 20, dc: 19, damage: "99 (18d10)" },
];
/** CD del tiro salvezza e danni di una trappola letale per il livello del gruppo (valori della scala SRD 5.2). */
export function trapProfile(level) {
  const t = TRAP_TIERS.find((x) => clampLevel(level) <= x.max);
  return { dc: t.dc, damage: t.damage, note: `trappola letale per i livelli ${t.min}-${t.max} (scala SRD 5.2)` };
}
