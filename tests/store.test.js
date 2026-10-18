import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { openDb, migrate, currentVersion, MIGRATIONS } from "../src/db.js";
import { Store, AppError } from "../src/store.js";
import { ValidationError } from "../src/schema.js";
import { memStore, genInto, tmpDir, ents } from "./helpers.js";

test("migrazioni: DB nuovo arriva all'ultima versione e una migrazione successiva conserva i dati", () => {
  const dir = tmpDir();
  const file = path.join(dir, "m.sqlite");
  let db = openDb(file);
  assert.equal(currentVersion(db), 1);
  new Store(db, {}).createCampaign({ title: "Persistente" });
  db.close();
  const v2 = [...MIGRATIONS, { version: 2, name: "test", sql: "ALTER TABLE campaigns ADD COLUMN note TEXT;" }];
  db = openDb(file, v2);
  assert.equal(currentVersion(db), 2);
  assert.equal(new Store(db, {}).listCampaigns()[0].title, "Persistente");
  db.close();
});
test("migrazioni: un DB più nuovo del codice viene rifiutato", () => {
  const dir = tmpDir();
  const file = path.join(dir, "n.sqlite");
  const v2 = [...MIGRATIONS, { version: 2, name: "x", sql: "SELECT 1;" }];
  openDb(file, v2).close();
  assert.throws(() => openDb(file), /più recente/);
});
test("migrazioni: una migrazione fallita viene annullata", () => {
  const db = openDb(":memory:");
  const bad = [...MIGRATIONS, { version: 2, name: "rotta", sql: "CREATE TABLE ok_t(a); INSERT INTO nonesiste VALUES (1);" }];
  assert.throws(() => migrate(db, bad), /Migrazione 2/);
  assert.equal(currentVersion(db), 1);
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='ok_t'").get(), undefined);
});

test("persistenza: chiudere e riaprire il database non perde dati", () => {
  const dir = tmpDir();
  const file = path.join(dir, "p.sqlite");
  let db = openDb(file);
  let s = new Store(db, { backupDir: path.join(dir, "b") });
  const { campaignId } = genInto(s, { seed: "persist" });
  const before = s.exportPayload(campaignId);
  db.close();
  db = openDb(file);
  s = new Store(db, { backupDir: path.join(dir, "b") });
  const after = s.exportPayload(campaignId);
  assert.equal(after.checksum, before.checksum);
  assert.equal(after.entities.length, 48);
  db.close();
});

test("validazione: riferimenti inesistenti, enum errati e campi obbligatori sono rifiutati", () => {
  const s = memStore();
  const c = s.createCampaign({ title: "V" });
  assert.throws(() => s.createEntity(c.id, "npc", { name: "X", location: "loc_inesistente" }), ValidationError);
  assert.throws(() => s.createEntity(c.id, "npc", { name: "X", status: "immortale" }), /valore ammesso/);
  assert.throws(() => s.createEntity(c.id, "npc", {}), /obbligatorio/);
  assert.throws(() => s.createEntity(c.id, "quest", { name: "Q" }), /obbligatorio/);
  assert.throws(() => s.createCampaign({ title: "Z", startLevel: 8, endLevel: 3 }), /livello finale/);
  assert.throws(() => s.createEntity(c.id, "nonesiste", { name: "x" }), AppError);
  assert.equal(s.listEntities(c.id).length, 0, "nessun dato parziale salvato");
});
test("validazione: un riferimento deve essere di un tipo ammesso", () => {
  const s = memStore();
  const c = s.createCampaign({ title: "T" });
  const npc = s.createEntity(c.id, "npc", { name: "Pg" });
  assert.throws(() => s.createEntity(c.id, "npc", { name: "Y", location: npc.id }), /tipo npc non ammesso/);
});

test("eliminazione: bloccata se l'elemento è ancora referenziato; cestino e ripristino", () => {
  const s = memStore();
  const { campaignId } = genInto(s);
  const town = ents(s, campaignId, "location").find((l) => l.data.kind === "città");
  assert.throws(() => s.trashEntity(town.id), (e) => e.status === 409 && e.details.inbound.length > 0);
  const lone = s.createEntity(campaignId, "item", { name: "Sasso" });
  s.trashEntity(lone.id);
  assert.equal(ents(s, campaignId, "item").some((i) => i.id === lone.id), false);
  assert.equal(s.listEntities(campaignId, { deleted: true }).length, 1);
  s.restoreEntity(lone.id);
  assert.equal(ents(s, campaignId, "item").some((i) => i.id === lone.id), true);
});
test("eliminazione definitiva e di campagna richiedono conferma esatta e creano un backup", () => {
  const s = memStore();
  const { campaignId } = genInto(s);
  const lone = s.createEntity(campaignId, "item", { name: "Sasso" });
  s.trashEntity(lone.id);
  assert.throws(() => s.purgeEntity(lone.id, "sbagliato"), /Conferma non valida/);
  s.purgeEntity(lone.id, "Sasso");
  assert.throws(() => s.getEntity(lone.id), /non trovato/);
  const title = s.getCampaign(campaignId).title;
  assert.throws(() => s.deleteCampaign(campaignId, "no"), /Conferma non valida/);
  const r = s.deleteCampaign(campaignId, title);
  assert.ok(fs.existsSync(path.join(s.backupDir, r.backup)));
  assert.equal(s.listCampaigns().length, 0);
});

test("versioni: ogni modifica crea una revisione e si può ripristinare", () => {
  const s = memStore();
  const { campaignId } = genInto(s);
  const npc = ents(s, campaignId, "npc")[0];
  const old = npc.data.personality;
  s.updateEntity(npc.id, { personality: "Nuova personalità" });
  s.updateEntity(npc.id, { role: "ruolo nuovo" });
  const revs = s.revisions(npc.id);
  assert.deepEqual(revs.map((r) => r.version), [3, 2, 1]);
  s.restoreRevision(npc.id, 1);
  const cur = s.getEntity(npc.id);
  assert.equal(cur.data.personality, old);
  assert.equal(cur.version, 4);
});
test("concorrenza: versione attesa diversa => conflitto", () => {
  const s = memStore();
  const { campaignId } = genInto(s);
  const npc = ents(s, campaignId, "npc")[0];
  s.updateEntity(npc.id, { role: "a" });
  assert.throws(() => s.updateEntity(npc.id, { role: "b" }, { expectedVersion: 1 }), (e) => e.status === 409);
});

test("backup: creazione, verifica, eliminazione e ripristino identici", () => {
  const s = memStore();
  const { campaignId } = genInto(s, { seed: "bk" });
  const original = s.exportPayload(campaignId);
  const b = s.createBackup(campaignId);
  s.deleteCampaign(campaignId, original.campaign.title);
  assert.equal(s.listCampaigns().length, 0);
  const restored = s.restoreBackup(b.file);
  assert.equal(restored.id, campaignId);
  assert.equal(s.exportPayload(campaignId).checksum, original.checksum);
});
test("backup: un file manomesso o corrotto è rifiutato e non modifica i dati", () => {
  const s = memStore();
  const { campaignId } = genInto(s);
  const b = s.createBackup(campaignId);
  const full = path.join(s.backupDir, b.file);
  const j = JSON.parse(fs.readFileSync(full, "utf8"));
  j.entities[0].data.name = "MANOMESSO";
  fs.writeFileSync(full, JSON.stringify(j));
  const before = s.exportPayload(campaignId).checksum;
  assert.throws(() => s.restoreBackup(b.file), /Checksum non valido/);
  fs.writeFileSync(full, "{ non json");
  assert.throws(() => s.restoreBackup(b.file), /illeggibile/);
  assert.throws(() => s.restoreBackup("../../etc/passwd.json"), /non valido/);
  assert.equal(s.exportPayload(campaignId).checksum, before);
});
test("importazione: crea una nuova campagna con id diversi e riferimenti integri; duplicazione", () => {
  const s = memStore();
  const { campaignId } = genInto(s);
  const copy = s.duplicateCampaign(campaignId);
  assert.notEqual(copy.id, campaignId);
  assert.match(copy.title, /\(copia\)/);
  const a = s.listEntities(campaignId), b = s.listEntities(copy.id);
  assert.equal(a.length, b.length);
  assert.equal(new Set([...a, ...b].map((e) => e.id)).size, a.length + b.length);
  const ids = new Set(b.map((e) => e.id));
  for (const e of b.filter((x) => x.type === "quest")) assert.ok(ids.has(e.data.giver));
  assert.equal(s.graph(copy.id).edges.length, s.graph(campaignId).edges.length);
});
test("importazione: formato errato o versione futura rifiutati", () => {
  const s = memStore();
  assert.throws(() => s.importPayload({ format: "altro" }), /non riconosciuto/);
  const { campaignId } = genInto(s);
  const p = s.exportPayload(campaignId);
  assert.throws(() => s.importPayload({ ...p, formatVersion: 9 }), /non supportata/);
});

test("generatore fallito o bundle invalido: nessun dato parziale", () => {
  const s = memStore();
  const bad = { campaign: { title: "Falsa" }, entities: [{ key: "a", type: "npc", data: { name: "A", location: "chiave_inesistente" } }] };
  assert.throws(() => s.importBundle(bad), ValidationError);
  assert.equal(s.listCampaigns().length, 0);
});

test("eventi: applicazione atomica degli effetti con storico", () => {
  const s = memStore();
  const c = s.createCampaign({ title: "E" });
  const n = s.createEntity(c.id, "npc", { name: "Vittima" });
  const ev = s.createEntity(c.id, "event", { name: "Agguato", day: 3, effects: [{ kind: "npcStatus", target: n.id, value: "morto" }] });
  const r = s.applyEvent(ev.id);
  assert.equal(s.getEntity(n.id).data.status, "morto");
  assert.equal(r.event.data.happened, true);
  assert.ok(s.revisions(n.id).some((x) => x.source === "evento"));
  assert.throws(() => s.applyEvent(ev.id), /già applicato/);
  const ev2 = s.createEntity(c.id, "event", { name: "Errore", day: 4, effects: [{ kind: "npcStatus", target: n.id, value: "vivo" }, { kind: "factionStanding", target: n.id, value: "1" }] });
  assert.throws(() => s.applyEvent(ev2.id), /incompatibile/);
  assert.equal(s.getEntity(n.id).data.status, "morto", "il primo effetto è stato annullato");
  assert.equal(s.getEntity(ev2.id).data.happened, false);
});
