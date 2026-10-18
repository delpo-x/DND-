import test from "node:test";
import assert from "node:assert/strict";
import { Rng } from "../src/rng.js";
import { generateDungeon, dungeonConnectivity, dungeonToSvg } from "../src/dungeon.js";
import { encounterBudget, buildEncounter, searchCreatures, loadCreatures, XP_BUDGET, RULES_SOURCES, proficiencyBonus, trapProfile } from "../src/rules.js";

test("rng: riproducibile per seed e fork indipendenti", () => {
  const a = new Rng("s"), b = new Rng("s");
  assert.deepEqual([a.next(), a.next(), a.int(1, 100)], [b.next(), b.next(), b.int(1, 100)]);
  assert.notEqual(new Rng("s").fork("x").next(), new Rng("s").fork("y").next());
});

test("dungeon: riproducibile e tutte le stanze raggiungibili (anche con porte segrete)", () => {
  for (const seed of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
    const d1 = generateDungeon({ seed }), d2 = generateDungeon({ seed });
    assert.deepEqual(d1, d2, `seed ${seed}`);
    const c = dungeonConnectivity(d1);
    assert.equal(c.allReachable, true, `seed ${seed}: ${c.unreachable}`);
    assert.ok(d1.rooms.some((r) => r.kind === "ingresso"));
  }
});

test("dungeon: seed diverso => mappa diversa; SVG contiene le stanze", () => {
  assert.notDeepEqual(generateDungeon({ seed: "u" }).grid, generateDungeon({ seed: "v" }).grid);
  const d = generateDungeon({ seed: "svg" });
  const svg = dungeonToSvg(d);
  assert.match(svg, /^<svg/);
  assert.ok(svg.includes("</svg>"));
});

test("dungeon: scontri generati dal pool SRD rispettano il budget XP", () => {
  const d = generateDungeon({ seed: "enc", level: 4, players: 4 });
  const withEnc = d.rooms.filter((r) => r.encounter?.creatures?.length);
  assert.ok(withEnc.length >= 1);
  for (const r of withEnc) assert.ok(r.encounter.totalXp <= r.encounter.budget, r.name);
});

test("regole: budget XP = valore tabella * giocatori; difficoltà o giocatori non validi => errore", () => {
  assert.equal(encounterBudget(3, 4, "moderata"), XP_BUDGET[3][1] * 4);
  assert.throws(() => encounterBudget(3, 4, "impossibile"), /Difficoltà/);
  assert.throws(() => encounterBudget(3, 0), /giocatori/);
  assert.equal(proficiencyBonus(1), 2);
  assert.equal(proficiencyBonus(9), 4);
});

test("regole: database creature SRD caricato, ricercabile, con fonte dichiarata e valori non ufficiali segnalati", () => {
  const { creatures } = loadCreatures();
  assert.ok(creatures.length > 300);
  assert.ok(searchCreatures({ q: "goblin" }).length >= 1);
  const e = buildEncounter(new Rng("e"), { level: 3, players: 4, difficulty: "moderata" });
  assert.ok(e.totalXp <= e.budget && e.creatures.length >= 1);
  assert.match(e.source, /SRD 5\.2/);
  assert.equal(RULES_SOURCES.encounterBudget.verified, true);
  assert.ok(Object.values(RULES_SOURCES).some((s) => s.verified === false), "le CD scelte dal generatore restano dichiarate non ufficiali");
});

test("regole: trappole sulla scala SRD 5.2 (livelli 1-4, 5-10, 11-16, 17-20)", () => {
  const cases = [[1, 13, "2d10"], [4, 13, "2d10"], [5, 15, "4d10"], [10, 15, "4d10"], [11, 17, "10d10"], [16, 17, "10d10"], [17, 19, "18d10"], [20, 19, "18d10"], [0, 13, "2d10"], [99, 19, "18d10"]];
  for (const [lv, dc, dice] of cases) {
    const t = trapProfile(lv);
    assert.equal(t.dc, dc, `livello ${lv}`);
    assert.ok(t.damage.includes(dice), `livello ${lv}: ${t.damage}`);
  }
  const traps = ["t1", "t2", "t3", "t4", "t5", "t6"].flatMap((seed) => generateDungeon({ seed, level: 7 }).rooms.map((r) => r.trap).filter(Boolean));
  assert.ok(traps.length >= 1, "nessuna trappola generata nei seed di prova");
  for (const t of traps) assert.match(t, /CD 15, 22 \(4d10\); trappola letale per i livelli 5-10/);
});
