import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTracker, trackerAction, EMPTY_TRACKER } from "../src/tracker.js";
import { ValidationError } from "../src/schema.js";
import { memStore } from "./helpers.js";

const mk = (name, initiative, hp = 10, extra = {}) => ({ name, initiative, hp, maxHp: hp, ac: 12, ...extra });
const base = () => normalizeTracker({ round: 1, turn: 0, combatants: [mk("Orco", 12), mk("Lyra", 17, 20, { kind: "pg" }), mk("Goblin", 12, 7)] });

test("tracker: validazione di PF, iniziativa, nome e limiti", () => {
  assert.throws(() => normalizeTracker({}), ValidationError);
  assert.throws(() => normalizeTracker({ combatants: [mk("", 1)] }), /nome obbligatorio/);
  assert.throws(() => normalizeTracker({ combatants: [{ ...mk("A", 1), hp: 11, maxHp: 10 }] }), /non possono superare/);
  assert.throws(() => normalizeTracker({ combatants: [mk("A", "x")] }), /numero intero/);
  assert.throws(() => normalizeTracker({ combatants: Array.from({ length: 61 }, (_, i) => mk("m" + i, 1)) }), /massimo 60/);
  assert.throws(() => normalizeTracker({ turn: 3, combatants: [mk("A", 1)] }), /fuori dall'elenco/);
  const ok = normalizeTracker({ combatants: [mk("A", "15", 5)] });
  assert.equal(ok.combatants[0].initiative, 15);
  assert.ok(ok.combatants[0].id);
});

test("tracker: ordinamento per iniziativa (PG prima a parità) e turno mantenuto", () => {
  const s = trackerAction(base(), { action: "sort" });
  assert.deepEqual(s.combatants.map((c) => c.name), ["Lyra", "Goblin", "Orco"]);
  const s2 = trackerAction({ ...base(), turn: 2 }, { action: "sort" }); // di turno: Goblin
  assert.equal(s2.combatants[s2.turn].name, "Goblin");
});

test("tracker: turni, round e salto dei caduti", () => {
  let s = trackerAction(base(), { action: "sort" });
  s = { ...s, turn: 0 }; // si parte da Lyra
  const id = (n) => s.combatants.find((c) => c.name === n).id;
  s = trackerAction(s, { action: "damage", id: id("Goblin"), amount: 99 });
  assert.equal(s.combatants.find((c) => c.name === "Goblin").hp, 0);
  s = trackerAction(s, { action: "next" });           // Lyra -> (Goblin a terra, saltato) -> Orco
  assert.equal(s.combatants[s.turn].name, "Orco");
  s = trackerAction(s, { action: "next" });           // giro completo
  assert.equal(s.round, 2);
  assert.equal(s.combatants[s.turn].name, "Lyra");
});

test("tracker: danno e cure limitati a 0..max; quantità non valide rifiutate; rimozione e azioni sconosciute", () => {
  let s = base();
  const o = s.combatants[0].id;
  s = trackerAction(s, { action: "damage", id: o, amount: 4 });
  assert.equal(s.combatants[0].hp, 6);
  s = trackerAction(s, { action: "heal", id: o, amount: 100 });
  assert.equal(s.combatants[0].hp, 10);
  assert.throws(() => trackerAction(s, { action: "damage", id: o, amount: -3 }), /quantità/);
  assert.throws(() => trackerAction(s, { action: "damage", id: "nope", amount: 1 }), /non trovato/);
  assert.throws(() => trackerAction(s, { action: "boh" }), /sconosciuta/);
  s = trackerAction(s, { action: "remove", id: o });
  assert.equal(s.combatants.length, 2);
  assert.deepEqual(trackerAction(s, { action: "clear" }), EMPTY_TRACKER);
  const r = trackerAction(trackerAction(s, { action: "damage", id: s.combatants[0].id, amount: 3 }), { action: "restart" });
  assert.ok(r.combatants.every((c) => c.hp === c.maxHp) && r.round === 1);
});

test("tracker: nessuno con un turno (mostri a terra, PG segnati morti) => il turno non avanza", () => {
  let s = base();
  for (const c of s.combatants) s = trackerAction(s, { action: "damage", id: c.id, amount: 999 });
  s = normalizeTracker({ ...s, combatants: s.combatants.map((c) => (c.kind === "pg" ? { ...c, conditions: ["morto"] } : c)) });
  assert.deepEqual(trackerAction(s, { action: "next" }), s);
});

test("tracker: un PG a 0 PF mantiene il turno (tiri contro la morte); un mostro a 0 PF no", () => {
  let s = normalizeTracker({ round: 1, turn: 0, combatants: [
    mk("Lyra", 20, 10, { id: "a", kind: "pg" }), mk("Orco", 10, 15, { id: "b" }), mk("Bor", 5, 12, { id: "c", kind: "pg" }), mk("Goblin", 3, 7, { id: "d" })] });
  s = trackerAction(s, { action: "damage", id: "c", amount: 12 });
  s = trackerAction(s, { action: "damage", id: "d", amount: 7 });
  s = trackerAction(s, { action: "next" }); // Orco
  s = trackerAction(s, { action: "next" }); // Bor a 0 PF: tocca a lui
  assert.equal(s.combatants[s.turn].name, "Bor");
  s = trackerAction(s, { action: "next" }); // Goblin a terra saltato => nuovo round
  assert.deepEqual([s.combatants[s.turn].name, s.round], ["Lyra", 2]);
  s = normalizeTracker({ ...s, combatants: s.combatants.map((c) => (c.id === "c" ? { ...c, conditions: ["Morto"] } : c)) });
  s = trackerAction(trackerAction(s, { action: "next" }), { action: "next" }); // Orco, poi Bor morto saltato
  assert.deepEqual([s.combatants[s.turn].name, s.round], ["Lyra", 3]);
});

test("tracker: rimuovere chi è di turno passa al successivo; se era l'ultimo, nuovo round dal primo", () => {
  const three = (turn) => normalizeTracker({ round: 3, turn, combatants: [mk("A", 20, 5, { id: "a" }), mk("B", 10, 5, { id: "b" }), mk("C", 5, 5, { id: "c" })] });
  const last = trackerAction(three(2), { action: "remove", id: "c" });
  assert.deepEqual([last.combatants[last.turn].name, last.round], ["A", 4]);
  const mid = trackerAction(three(1), { action: "remove", id: "b" });
  assert.deepEqual([mid.combatants[mid.turn].name, mid.round], ["C", 3]);
  const before = trackerAction(three(2), { action: "remove", id: "a" });
  assert.deepEqual([before.combatants[before.turn].name, before.round], ["C", 3]);
  const only = trackerAction(normalizeTracker({ round: 2, turn: 0, combatants: [mk("Solo", 1, 5, { id: "s" })] }), { action: "remove", id: "s" });
  assert.deepEqual([only.combatants.length, only.turn], [0, 0]);
});

test("tracker: persistenza per campagna e pulizia all'eliminazione della campagna", () => {
  const s = memStore();
  const c = s.createCampaign({ title: "Trk" });
  s.setSetting(`tracker:${c.id}`, base());
  assert.equal(s.getSetting(`tracker:${c.id}`).combatants.length, 3);
  s.deleteCampaign(c.id, "Trk");
  assert.equal(s.getSetting(`tracker:${c.id}`), null);
});
