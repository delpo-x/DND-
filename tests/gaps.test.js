// Test aggiunti dopo il rapporto di copertura (node --test --experimental-test-coverage): rami prima mai eseguiti.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { memStore, genInto, tmpDir } from "./helpers.js";
import { checkCoherence } from "../src/coherence.js";
import { validateAgainst } from "../src/schema.js";
import { xpSpan, XP_TO_LEVEL } from "../src/rules.js";
import { createApp } from "../src/server.js";

const rules = (s, cid) => checkCoherence(s.getCampaign(cid), s.listEntities(cid)).issues;

test("coerenza: PNG in due fazioni nemiche segnalato come rischio", () => {
  const s = memStore();
  const { campaignId, ids } = genInto(s, { seed: "fz" });
  s.updateEntity(ids.npc_merchant, { factions: [ids.fac_a, ids.fac_c] });
  const i = rules(s, campaignId).find((x) => x.rule === "PNG-FAZIONI");
  assert.ok(i, "manca PNG-FAZIONI");
  assert.equal(i.severity, "rischio");
});

test("coerenza: indizio non scopribile spiega il motivo (PNG morto, luogo bloccato)", () => {
  const s = memStore();
  const { campaignId, ids } = genInto(s, { seed: "cl" });
  s.updateEntity(ids.npc_witness, { status: "morto" });
  const dead = rules(s, campaignId).find((x) => x.rule === "INDIZIO-IRRAGGIUNGIBILE" && /La testimonianza/.test(x.message));
  assert.ok(dead, "indizio dal PNG morto");
  assert.match(dead.message, /inaccessibile o morto/);
  s.updateEntity(ids.npc_witness, { status: "vivo" });
  s.updateEntity(ids.loc_village, { access: "bloccato", unlockedBy: null });
  const blocked = rules(s, campaignId).filter((x) => x.rule === "INDIZIO-IRRAGGIUNGIBILE" || x.rule === "LUOGO-INACCESSIBILE");
  assert.ok(blocked.some((x) => /non è accessibile|mai accessibile/.test(x.message)), JSON.stringify(blocked.map((x) => x.message)));
});

test("coerenza: missione completata con prerequisito non completato => stato incoerente; esito scelto inesistente => rischio", () => {
  const s = memStore();
  const { campaignId, ids } = genInto(s, { seed: "st" });
  s.updateEntity(ids.q_s2, { status: "completata", chosenOutcome: "Esito inventato" });
  const st = rules(s, campaignId).filter((x) => x.rule === "STATO-INCOERENTE");
  assert.ok(st.some((x) => x.severity === "errore" && /prerequisito/.test(x.message)), JSON.stringify(st));
  assert.ok(st.some((x) => x.severity === "rischio" && /esito scelto/i.test(x.message)), JSON.stringify(st));
});

test("schema: un tipo di campo sconosciuto è un errore di validazione, non un dato accettato in silenzio", () => {
  assert.throws(() => validateAgainst([{ k: "x", label: "X", t: "misterioso" }], { x: 1 }, () => true), (e) => e.errors?.some((x) => /tipo di campo sconosciuto/.test(x.message)));
});

test("regole: PE accumulati tra due livelli (con livelli fuori intervallo limitati a 1-20)", () => {
  assert.equal(xpSpan(1, 5), XP_TO_LEVEL[5] - XP_TO_LEVEL[1]);
  assert.equal(xpSpan(0, 99), XP_TO_LEVEL[20] - XP_TO_LEVEL[1]);
  assert.equal(xpSpan(3, 3), 0);
});

test("store: archiviazione e ripristino cambiano lo stato e il segno di aggiornamento; elenco backup vuoto senza cartella", () => {
  const s = memStore();
  const { campaignId } = genInto(s, { seed: "arc" });
  const t0 = s.getCampaign(campaignId).updatedAt;
  assert.equal(s.setArchived(campaignId, true).archived, true);
  assert.ok(s.getCampaign(campaignId).updatedAt > t0);
  assert.equal(s.setArchived(campaignId, false).archived, false);
  assert.deepEqual(s.listBackups(), [], "nessuna cartella dei backup ancora creata");
  s.createBackup(campaignId);
  const list = s.listBackups();
  assert.equal(list.length, 1);
  assert.ok(list[0].bytes > 1000 && list[0].file.endsWith(".json"));
});

// ---------------- API ----------------
const dir = tmpDir("dcs-gaps-");
let app, base;
before(async () => {
  app = createApp({ dbFile: path.join(dir, "g.sqlite"), backupDir: path.join(dir, "backups") });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${app.server.address().port}`;
});
after(async () => { app.server.closeAllConnections?.(); await new Promise((r) => app.server.close(r)); });
const call = async (method, url, body) => {
  const r = await fetch(base + url, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text, headers: r.headers };
};

test("API: tema sconosciuto => 400 con i valori ammessi (prima era un errore interno 500)", async () => {
  const r = await call("POST", "/api/campaigns", { generate: true, params: { themeId: "inesistente" } });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /Tema sconosciuto.*culto/);
});

test("API: esportazioni — formato non supportato, dungeon in SVG e Markdown, archiviazione", async () => {
  const c = (await call("POST", "/api/campaigns", { generate: true, params: { seed: "gap-exp" } })).json.campaign;
  assert.equal((await call("GET", `/api/campaigns/${c.id}/export?format=pdf`)).status, 400);
  const html = await call("GET", `/api/campaigns/${c.id}/export?format=html`);
  assert.match(html.headers.get("content-disposition") ?? "", /\.html/);
  const dn = (await call("GET", `/api/campaigns/${c.id}/entities?type=dungeon`)).json[0];
  const svg = await call("GET", `/api/entities/${dn.id}/export?format=svg`);
  assert.equal(svg.status, 200);
  assert.match(svg.headers.get("content-type"), /image\/svg\+xml/);
  assert.match(svg.text, /^<svg/);
  const md = await call("GET", `/api/entities/${dn.id}/export?format=md`);
  assert.match(md.text, new RegExp(`^# ${dn.data.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.equal((await call("GET", `/api/entities/${dn.id}/export?format=pdf`)).status, 400);
  const ar = await call("POST", `/api/campaigns/${c.id}/archive`, { archived: true });
  assert.equal(ar.json.archived, true);
  assert.equal((await call("POST", `/api/campaigns/${c.id}/archive`, { archived: false })).json.archived, false);
});
