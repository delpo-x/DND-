// Test di regressione per le falle trovate nella revisione del 2026-10-17: ognuno riproduce il caso che prima falliva.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import path from "node:path";
import { createApp } from "../src/server.js";
import { checkCoherence } from "../src/coherence.js";
import { campaignToMarkdown, campaignToHtml, dungeonExport } from "../src/export.js";
import { generateDungeon } from "../src/dungeon.js";
import { OllamaProvider } from "../src/ai.js";
import { ValidationError } from "../src/schema.js";
import { memStore, tmpDir } from "./helpers.js";

const sha = (p) => crypto.createHash("sha256").update(JSON.stringify({ campaign: p.campaign, entities: p.entities })).digest("hex");

// ---------- dati ----------
test("regressione: i backup di campagne con titolo non latino si ripristinano (anche quello pre-eliminazione)", () => {
  const s = memStore();
  for (const title of ["Ωmega del Drago", "Город теней", "龍の巣", "Caffè «Nero»"]) {
    const c = s.createCampaign({ title });
    s.createEntity(c.id, "npc", { name: "Testimone" });
    const b = s.createBackup(c.id);
    assert.equal(s.restoreBackup(b.file).title, title, title);
    const del = s.deleteCampaign(c.id, title);
    const back = s.restoreBackup(del.backup);
    assert.equal(back.title, title);
    assert.equal(s.listEntities(back.id).length, 1);
  }
  for (const bad of ["../x.json", "a/b.json", "a\\b.json", "x.txt", "..json"]) assert.throws(() => s.restoreBackup(bad), /non valido/, bad);
});

test("regressione: i dungeon con dati incoerenti vengono rifiutati (creazione, modifica, importazione)", () => {
  const s = memStore();
  const c = s.createCampaign({ title: "Cripte" });
  const good = generateDungeon({ seed: "r1", name: "Cripta" });
  const d = s.createEntity(c.id, "dungeon", good);
  const r0 = good.rooms[0];
  const cases = [
    ["senza griglia", { name: "X", seed: "s", width: 20, height: 20, rooms: [{ id: "r", name: "R", x: 1, y: 1, w: 2, h: 2, kind: "ingresso" }] }, /griglia/],
    ["nessuna stanza", { ...good, rooms: [] }, /almeno una stanza/],
    ["stanza fuori mappa", { ...good, rooms: [{ ...r0, y: 999 }] }, /esce dalla mappa/],
    ["incontro {}", { ...good, rooms: [{ ...r0, encounter: {} }] }, /incontro non valido/],
    ["riga corta", { ...good, grid: [good.grid[0].slice(1), ...good.grid.slice(1)] }, /caselle/],
    ["carattere estraneo", { ...good, grid: [good.grid[0].replace("#", "X"), ...good.grid.slice(1)] }, /caratteri/],
  ];
  for (const [label, data, re] of cases) {
    assert.throws(() => s.createEntity(c.id, "dungeon", data), (e) => e instanceof ValidationError && re.test(e.message), "crea: " + label);
    assert.throws(() => s.updateEntity(d.id, data), (e) => e instanceof ValidationError && re.test(e.message), "modifica: " + label);
  }
  // importazione di un file modificato a mano con checksum ricalcolato: la validazione lo ferma comunque
  const p = s.exportPayload(c.id);
  p.entities.find((e) => e.type === "dungeon").data.rooms[0].encounter = {};
  p.checksum = sha(p);
  assert.throws(() => s.importPayload(p), (e) => e instanceof ValidationError && /dungeon "Cripta"/.test(e.message));
  assert.equal(s.listCampaigns().length, 1, "nessuna campagna creata a metà");
});

test("regressione: dati di dungeon già salvati e non validi non bloccano export, mappa e controllo di coerenza", () => {
  const s = memStore();
  const c = s.createCampaign({ title: "Vecchi dati" });
  const d = s.createEntity(c.id, "dungeon", generateDungeon({ seed: "r2", name: "Pozzo" }));
  // simula dati scritti da una versione precedente (senza passare dalla validazione)
  const broken = { ...d.data, grid: undefined, rooms: [{ ...d.data.rooms[0], encounter: {} }] };
  s.db.prepare("UPDATE entities SET data=? WHERE id=?").run(JSON.stringify(broken), d.id);
  const all = s.listEntities(c.id);
  const rep = checkCoherence(s.getCampaign(c.id), all);
  assert.ok(rep.issues.some((i) => i.rule === "DUNGEON-DATI"), "segnalato come errore");
  assert.match(campaignToMarkdown(s.getCampaign(c.id), all), /dati dell'incontro non validi/);
  assert.match(campaignToHtml(s.getCampaign(c.id), all), /<html/);
  const x = dungeonExport(s.getEntity(d.id));
  assert.match(x.svg, /<svg/);
  s.db.prepare("UPDATE entities SET data=? WHERE id=?").run(JSON.stringify({ ...d.data, rooms: [] }), d.id);
  assert.doesNotThrow(() => checkCoherence(s.getCampaign(c.id), s.listEntities(c.id)));
});

test("regressione: i dungeon generati da tutti i temi superano la nuova validazione", () => {
  for (const seed of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
    const s = memStore();
    const c = s.createCampaign({ title: "G" });
    assert.doesNotThrow(() => s.createEntity(c.id, "dungeon", generateDungeon({ seed, width: 20 + seed.charCodeAt(0) % 60, height: 20 + seed.charCodeAt(0) % 40, rooms: 3 + seed.charCodeAt(0) % 17 })), seed);
  }
});

test("regressione: la campagna rifiuta salvataggi da una scheda non aggiornata", () => {
  const s = memStore();
  const c = s.createCampaign({ title: "Due schede", premise: "A" });
  const v = s.getCampaign(c.id).version;
  s.updateCampaign(c.id, { premise: "scheda A" }, { expectedVersion: v });
  assert.throws(() => s.updateCampaign(c.id, { setting: "scheda B" }, { expectedVersion: v }), /modificata altrove/);
  assert.equal(s.getCampaign(c.id).premise, "scheda A");
});

test("regressione: la ricerca guarda solo il testo leggibile, senza chiavi né id, e ignora le maiuscole accentate", () => {
  const s = memStore();
  const c = s.createCampaign({ title: "Ricerca" });
  const l = s.createEntity(c.id, "location", { name: "Torre", kind: "edificio" });
  s.createEntity(c.id, "npc", { name: "Aldo", location: l.id, behaviors: [{ situation: "Sotto la luna", reaction: "ulula" }] });
  s.createEntity(c.id, "npc", { name: "Èlite del porto", status: "scomparso" });
  const names = (q) => s.listEntities(c.id, { q }).map((e) => e.data.name).sort();
  assert.deepEqual(names("motivations"), []);
  assert.deepEqual(names("loc_"), []);
  assert.deepEqual(names("_"), []);
  assert.deepEqual(names("%"), []);
  assert.deepEqual(names("èlite"), ["Èlite del porto"]);
  assert.deepEqual(names("ÈLITE"), ["Èlite del porto"]);
  assert.deepEqual(names("ulula"), ["Aldo"], "testo dentro le liste");
  assert.deepEqual(names("scomparso"), ["Èlite del porto"], "valori enum");
});

test("regressione: la ricerca in memoria resta rapida su 3000 elementi (misurato ~22 ms; limite largo 1 s)", () => {
  const s = memStore();
  const c = s.createCampaign({ title: "Grande" });
  const words = "torre faro sale nebbia porto ombra lama corvo vela marea scoglio lanterna".split(" ");
  const w = (i, n) => Array.from({ length: n }, (_, k) => words[(i * 7 + k * 3) % words.length]).join(" ");
  for (let i = 0; i < 3000; i++) s.createEntity(c.id, "npc", { name: `Png ${i}`, role: w(i, 3), motivations: [w(i, 8)], behaviors: [{ situation: w(i, 6), reaction: w(i + 1, 6) }], secrets: [w(i, 12)] });
  s.listEntities(c.id, { q: "lanterna" });
  const t = performance.now();
  const hits = s.listEntities(c.id, { q: "lanterna" }).length;
  const ms = performance.now() - t;
  assert.equal(hits, 2000);
  assert.ok(ms < 1000, `ricerca in ${ms.toFixed(0)} ms`);
  const coh = performance.now();
  checkCoherence(s.getCampaign(c.id), s.listEntities(c.id));
  assert.ok(performance.now() - coh < 2000, "controllo di coerenza su 3000 elementi");
});

// ---------- logica ----------
test("regressione: indizio ottenibile solo da un PNG scomparso => rischio segnalato", () => {
  const s = memStore();
  const c = s.createCampaign({ title: "Scomparsi" });
  const l = s.createEntity(c.id, "location", { name: "Borgo", kind: "villaggio" });
  const n = s.createEntity(c.id, "npc", { name: "Gilda", status: "scomparso", location: l.id });
  const k = s.createEntity(c.id, "clue", { name: "Solo Gilda lo sa", text: "t", foundWithNpc: n.id });
  s.createEntity(c.id, "quest", { name: "Q", premise: "p", objective: "o", giver: n.id, locations: [l.id], outcomes: [{ label: "x" }] });
  const rep = checkCoherence(s.getCampaign(c.id), s.listEntities(c.id));
  assert.ok(rep.issues.some((i) => i.rule === "INDIZIO-PNG-SCOMPARSO" && i.entities.some((e) => e.id === k.id)));
  assert.ok(rep.issues.some((i) => i.rule === "COMMITTENTE-SCOMPARSO"));
  s.updateEntity(k.id, { foundAtLocation: l.id });
  const rep2 = checkCoherence(s.getCampaign(c.id), s.listEntities(c.id));
  assert.ok(!rep2.issues.some((i) => i.rule === "INDIZIO-PNG-SCOMPARSO"), "con una fonte alternativa il rischio sparisce");
});

test("regressione: Ollama non si dichiara pronto per un nome di modello che non risolve", async () => {
  const fake = (models) => async () => ({ ok: true, status: 200, json: async () => ({ models: models.map((name) => ({ name })) }) });
  const st = (model, models) => new OllamaProvider({ baseUrl: "http://127.0.0.1:11434", model }, fake(models)).status();
  const a = await st("qwen2.5", ["qwen2.5:3b"]);
  assert.equal(a.available, false);
  assert.match(a.message, /qwen2\.5:3b/);
  assert.equal((await st("qwen2.5", ["qwen2.5:latest"])).available, true);
  assert.equal((await st("qwen2.5:3b", ["qwen2.5:3b"])).available, true);
  assert.equal((await st("qwen2.5:7b", ["qwen2.5:3b"])).available, false);
});

// ---------- server ----------
let app, base, port;
before(async () => {
  const dir = tmpDir("dcs-reg-");
  app = createApp({ dbFile: path.join(dir, "r.sqlite"), backupDir: path.join(dir, "b") });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  port = app.server.address().port;
  base = `http://127.0.0.1:${port}`;
});
after(async () => { app.server.closeAllConnections?.(); await new Promise((r) => app.server.close(r)); });
const call = async (method, url, body, headers = {}) => {
  const r = await fetch(base + url, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: r.status, json };
};
const rawGet = (p) => new Promise((resolve) => { http.get({ host: "127.0.0.1", port, path: p, headers: { host: `localhost:${port}` } }, (res) => { res.resume(); resolve(res.statusCode); }); });

test("regressione (server): input malformati => 400/403, mai 500", async () => {
  assert.equal(await rawGet("/api/entities/%E0"), 400);
  assert.equal(await rawGet("/%E0%A4%A"), 400);
  assert.equal((await call("POST", "/api/campaigns", { title: "x" }, { origin: "null" })).status, 403);
  for (const body of [{ width: -1 }, { width: 3000, height: 3000 }, { height: 5 }, { rooms: 0 }, { level: 99 }, { width: "abc" }, { players: 0 }]) {
    const r = await call("POST", "/api/dungeon/preview", body);
    assert.equal(r.status, 400, JSON.stringify(body) + " " + JSON.stringify(r.json));
  }
  assert.equal((await call("POST", "/api/dungeon/preview", { seed: "ok", width: 80, height: 60, rooms: 20 })).status, 200);
  const c = (await call("POST", "/api/campaigns", { title: "Gen" })).json;
  assert.equal((await call("POST", `/api/campaigns/${c.id}/generate`, { kind: "dungeon", width: 500 })).status, 400);
});

test("regressione (server): campagna e tracker rifiutano salvataggi da schede non aggiornate (409)", async () => {
  const c = (await call("POST", "/api/campaigns", { title: "Concorrenza" })).json;
  const a = await call("PUT", `/api/campaigns/${c.id}`, { premise: "A", expectedVersion: c.version });
  assert.equal(a.status, 200);
  const b = await call("PUT", `/api/campaigns/${c.id}`, { setting: "B", expectedVersion: c.version });
  assert.equal(b.status, 409);
  assert.equal((await call("GET", `/api/campaigns/${c.id}`)).json.premise, "A");

  const t0 = (await call("GET", `/api/campaigns/${c.id}/tracker`)).json;
  assert.equal(t0.rev, 0);
  const add = (name) => ({ ...t0, combatants: [{ name, initiative: 10, hp: 5, maxHp: 5 }] });
  const tabA = await call("PUT", `/api/campaigns/${c.id}/tracker`, { ...add("Orco"), expectedRev: 0 });
  assert.equal(tabA.status, 200);
  assert.equal(tabA.json.rev, 1);
  const tabB = await call("PUT", `/api/campaigns/${c.id}/tracker`, { ...add("Goblin"), expectedRev: 0 });
  assert.equal(tabB.status, 409);
  const act = await call("POST", `/api/campaigns/${c.id}/tracker/action`, { action: "next" });
  assert.equal(act.json.rev, 2, "anche le azioni avanzano la revisione");
  assert.deepEqual((await call("GET", `/api/campaigns/${c.id}/tracker`)).json.combatants.map((x) => x.name), ["Orco"]);
});
