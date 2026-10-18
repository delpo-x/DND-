import test from "node:test";
import assert from "node:assert/strict";
import { checkCoherence } from "../src/coherence.js";
import { memStore, genInto, ents } from "./helpers.js";

const run = (s, cid) => checkCoherence(s.getCampaign(cid), s.listEntities(cid).concat(s.listEntities(cid, { deleted: true })));
const rules = (r) => r.issues.map((i) => i.rule);

function fresh() {
  const s = memStore();
  const { campaignId } = genInto(s, { seed: "coh" });
  assert.equal(run(s, campaignId).issues.length, 0, "base pulita");
  return { s, cid: campaignId };
}

test("coerenza: dipendenza circolare tra missioni => errore CICLO con elementi coinvolti e correzione", () => {
  const { s, cid } = fresh();
  const [a, b] = ents(s, cid, "quest").filter((q) => !(q.data.prerequisites ?? []).length || true);
  s.updateEntity(a.id, { prerequisites: [{ target: b.id, intentionalCycle: false }] });
  s.updateEntity(b.id, { prerequisites: [{ target: a.id, intentionalCycle: false }] });
  const r = run(s, cid);
  const issue = r.issues.find((i) => i.rule === "CICLO");
  assert.ok(issue, JSON.stringify(rules(r)));
  assert.equal(issue.severity, "errore");
  assert.ok(issue.entities.length >= 2);
  assert.ok(issue.suggestion);
});

test("coerenza: ciclo marcato intenzionale scende a suggerimento", () => {
  const { s, cid } = fresh();
  const [a, b] = ents(s, cid, "quest");
  s.updateEntity(a.id, { prerequisites: [{ target: b.id, intentionalCycle: true }] });
  s.updateEntity(b.id, { prerequisites: [{ target: a.id, intentionalCycle: true }] });
  const issue = run(s, cid).issues.find((i) => i.rule === "CICLO");
  assert.equal(issue?.severity, "suggerimento");
});

test("coerenza: luogo segreto che nessuno sblocca => LUOGO-INACCESSIBILE", () => {
  const { s, cid } = fresh();
  const lone = s.createEntity(cid, "location", { name: "Cantina perduta", kind: "dungeon", access: "segreto" });
  const r = run(s, cid);
  assert.ok(r.issues.some((i) => i.rule === "LUOGO-INACCESSIBILE" && i.entities.some((e) => e.id === lone.id)));
});

test("coerenza: indizio senza fonte => INDIZIO-IRRAGGIUNGIBILE", () => {
  const { s, cid } = fresh();
  const clue = s.createEntity(cid, "clue", { name: "Biglietto orfano", text: "Non si sa da dove venga.", truthful: true });
  const r = run(s, cid);
  assert.ok(r.issues.some((i) => i.rule === "INDIZIO-IRRAGGIUNGIBILE" && i.entities.some((e) => e.id === clue.id)));
});

test("coerenza: PNG morto che partecipa a evento futuro => errore PNG-MORTO", () => {
  const { s, cid } = fresh();
  const npc = ents(s, cid, "npc")[0];
  const ev = s.createEntity(cid, "event", { name: "Banchetto", kind: "previsto", day: 20, participants: [npc.id] });
  s.updateEntity(npc.id, { status: "morto" });
  const r = run(s, cid);
  assert.ok(r.issues.some((i) => i.rule === "PNG-MORTO" && i.severity === "errore" && i.entities.some((e) => e.id === ev.id)));
});

test("coerenza: PNG in due luoghi lontani nello stesso periodo => errore PNG-AGENDA", () => {
  const { s, cid } = fresh();
  const [l1, l2] = ents(s, cid, "location");
  const npc = s.createEntity(cid, "npc", { name: "Doppione", schedule: [{ location: l1.id, fromDay: 1, toDay: 10 }, { location: l2.id, fromDay: 5, toDay: 12 }] });
  const r = run(s, cid);
  assert.ok(r.issues.some((i) => i.rule === "PNG-AGENDA" && i.entities.some((e) => e.id === npc.id)));
});

test("coerenza: PNG che dovrebbe spostarsi tra luoghi non collegati => rischio PNG-VIAGGIO", () => {
  const { s, cid } = fresh();
  const [l1] = ents(s, cid, "location");
  const isola = s.createEntity(cid, "location", { name: "Isola irraggiungibile", kind: "natura", access: "pubblico" });
  s.createEntity(cid, "npc", { name: "Corriere veloce", schedule: [{ location: l1.id, fromDay: 1, toDay: 1 }, { location: isola.id, fromDay: 2, toDay: 2 }] });
  const issue = run(s, cid).issues.find((i) => i.rule === "PNG-VIAGGIO");
  assert.ok(issue);
  assert.equal(issue.severity, "rischio");
});

test("coerenza: l'applicazione della correzione proposta elimina il problema", () => {
  const { s, cid } = fresh();
  const clue = s.createEntity(cid, "clue", { name: "Biglietto orfano", text: "x", truthful: true });
  assert.ok(rules(run(s, cid)).includes("INDIZIO-IRRAGGIUNGIBILE"));
  const town = ents(s, cid, "location").find((l) => l.data.access === "pubblico");
  s.updateEntity(clue.id, { foundAtLocation: town.id });
  assert.ok(!rules(run(s, cid)).includes("INDIZIO-IRRAGGIUNGIBILE"));
});

test("coerenza: PNG che conosce un'informazione senza fonte => rischio CONOSCENZA-SENZA-FONTE", () => {
  const { s, cid } = fresh();
  const npc = ents(s, cid, "npc")[0];
  s.updateEntity(npc.id, { knowledge: [...(npc.data.knowledge ?? []), { fact: "Il tesoro è sotto la torre", source: null, hidden: false }] });
  assert.ok(rules(run(s, cid)).includes("CONOSCENZA-SENZA-FONTE"));
});

test("coerenza: elementi nel cestino non contano come esistenti", () => {
  const { s, cid } = fresh();
  const lone = s.createEntity(cid, "item", { name: "Solo" });
  s.trashEntity(lone.id);
  assert.equal(run(s, cid).issues.length, 0);
});

test("coerenza testo: nome di PNG citato ma inesistente => rischio TESTO-NOME-SCONOSCIUTO", () => {
  const { s, cid } = fresh();
  const q = ents(s, cid, "quest")[0];
  s.updateEntity(q.id, { premise: q.data.premise + " Si dice che Alderico Pietrasecca sappia tutto." });
  const issue = run(s, cid).issues.find((i) => i.rule === "TESTO-NOME-SCONOSCIUTO");
  assert.ok(issue && issue.severity === "rischio" && issue.entities.some((e) => e.id === q.id));
  s.createEntity(cid, "npc", { name: "Alderico Pietrasecca", location: ents(s, cid, "location")[0].id });
  assert.ok(!rules(run(s, cid)).includes("TESTO-NOME-SCONOSCIUTO"), "scompare creando il PNG");
});

test("coerenza testo: citare un elemento nel cestino => rischio TESTO-ELIMINATO", () => {
  const { s, cid } = fresh();
  const item = s.createEntity(cid, "item", { name: "Amuleto dimenticato" });
  const q = ents(s, cid, "quest")[0];
  s.updateEntity(q.id, { premise: q.data.premise + " Serve l'Amuleto dimenticato." });
  assert.ok(!rules(run(s, cid)).includes("TESTO-ELIMINATO"));
  s.trashEntity(item.id);
  assert.ok(rules(run(s, cid)).includes("TESTO-ELIMINATO"));
});

test("coerenza testo: PNG morto citato in una missione => suggerimento TESTO-PNG-MORTO", () => {
  const { s, cid } = fresh();
  const npc = s.createEntity(cid, "npc", { name: "Tizzone Brucia", location: ents(s, cid, "location")[0].id });
  const q = ents(s, cid, "quest")[0];
  s.updateEntity(q.id, { premise: q.data.premise + " Tizzone Brucia aspetta al ponte." });
  s.updateEntity(npc.id, { status: "morto" });
  const issue = run(s, cid).issues.find((i) => i.rule === "TESTO-PNG-MORTO");
  assert.equal(issue?.severity, "suggerimento");
});
