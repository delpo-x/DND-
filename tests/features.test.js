// Test delle funzioni aggiunte dopo la prima versione: ricaricamento ridotto, tracker in backup ed export, unione dei conflitti,
// annullamento della rigenerazione, riepilogo e scheda della sessione, scheletri narrativi alternativi.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import { memStore, genInto, ents, byName, tmpDir } from "./helpers.js";
import { generateCampaignBundle, STRUCTURES } from "../src/gen-det.js";
import { checkCoherence } from "../src/coherence.js";
import { sessionBrief, currentSession, npcLocationOn } from "../src/brief.js";
import { sessionToMarkdown, sessionToHtml, campaignToMarkdown } from "../src/export.js";
import { mergeForConflict, normField, previewValue } from "../public/lib.js";
import { ENTITY_TYPES } from "../src/schema.js";
import { createApp } from "../src/server.js";

const digest = (p) => crypto.createHash("sha256").update(JSON.stringify(p.tracker !== undefined ? { campaign: p.campaign, entities: p.entities, tracker: p.tracker } : { campaign: p.campaign, entities: p.entities })).digest("hex");
const TRK = { round: 3, turn: 1, combatants: [{ id: "a", name: "Mira", kind: "pg", initiative: 15, hp: 9, maxHp: 12, ac: 14, conditions: ["prono"], notes: "", source: "" }, { id: "b", name: "Lupo", kind: "mostro", initiative: 12, hp: 0, maxHp: 11, ac: 13, conditions: [], notes: "ferito", source: "" }] };

// ---------------- ricaricamento ridotto ----------------
test("campagna: updatedAt cresce in modo strettamente monotono anche con modifiche nello stesso millisecondo", () => {
  const s = memStore();
  const { campaignId } = genInto(s, { seed: "mono" });
  const npc = ents(s, campaignId, "npc")[0];
  const stamps = [s.getCampaign(campaignId).updatedAt];
  for (let i = 0; i < 25; i++) { s.updateEntity(npc.id, { personality: `variante ${i}` }); stamps.push(s.getCampaign(campaignId).updatedAt); }
  for (let i = 1; i < stamps.length; i++) assert.ok(stamps[i] > stamps[i - 1], `${stamps[i - 1]} -> ${stamps[i]}`);
  // anche cestino, ripristino ed eliminazione definitiva cambiano il segno (l'interfaccia deve riscaricare)
  const lone = s.createEntity(campaignId, "item", { name: "Sasso", kind: "altro" });
  const t0 = s.getCampaign(campaignId).updatedAt;
  s.trashEntity(lone.id); const t1 = s.getCampaign(campaignId).updatedAt;
  s.restoreEntity(lone.id); const t2 = s.getCampaign(campaignId).updatedAt;
  s.trashEntity(lone.id); s.purgeEntity(lone.id, "Sasso"); const t3 = s.getCampaign(campaignId).updatedAt;
  assert.ok(t0 < t1 && t1 < t2 && t2 < t3);
});

// ---------------- tracker in backup ed export ----------------
test("tracker: incluso nell'esportazione JSON e ripristinato dal backup, con revisione che avanza", () => {
  const s = memStore();
  const { campaignId } = genInto(s, { seed: "trk" });
  s.setSetting(`tracker:${campaignId}`, { ...TRK, rev: 7 });
  const pay = s.exportPayload(campaignId);
  assert.deepEqual(pay.tracker, TRK, "la revisione non viaggia nel file");
  const b = s.createBackup(campaignId);
  s.setSetting(`tracker:${campaignId}`, { round: 9, turn: 0, rev: 8, combatants: [] });
  s.restoreBackup(b.file);
  const back = s.getSetting(`tracker:${campaignId}`);
  assert.deepEqual({ round: back.round, turn: back.turn, combatants: back.combatants }, TRK);
  assert.equal(back.rev, 9, "rev = precedente + 1: le schede aperte con il vecchio stato ricevono 409");
});

test("tracker: vuoto si esporta (e al ripristino svuota); assente non si esporta e un file senza tracker lascia quello attuale", () => {
  const s = memStore();
  const { campaignId } = genInto(s, { seed: "trk2" });
  assert.equal("tracker" in s.exportPayload(campaignId), false, "tracker mai usato: nessun campo");
  const old = s.createBackup(campaignId); // file "vecchio", senza tracker
  s.setSetting(`tracker:${campaignId}`, { ...TRK, rev: 2 });
  s.restoreBackup(old.file);
  assert.deepEqual(s.getSetting(`tracker:${campaignId}`).combatants, TRK.combatants, "un file senza tracker non tocca lo stato attuale");
  s.setSetting(`tracker:${campaignId}`, { round: 1, turn: 0, rev: 3, combatants: [] });
  const empty = s.createBackup(campaignId);
  assert.deepEqual(s.exportPayload(campaignId).tracker, { round: 1, turn: 0, combatants: [] });
  s.setSetting(`tracker:${campaignId}`, { ...TRK, rev: 4 });
  s.restoreBackup(empty.file);
  assert.deepEqual(s.getSetting(`tracker:${campaignId}`).combatants, [], "il file con tracker vuoto lo svuota");
});

test("tracker: importazione come nuova campagna e duplicazione lo copiano; un tracker non valido nel file è rifiutato (422)", () => {
  const s = memStore();
  const { campaignId } = genInto(s, { seed: "trk3" });
  s.setSetting(`tracker:${campaignId}`, { ...TRK, rev: 5 });
  const dup = s.duplicateCampaign(campaignId);
  assert.deepEqual(s.getSetting(`tracker:${dup.id}`).combatants, TRK.combatants);
  const pay = s.exportPayload(campaignId);
  const bad = { ...pay, tracker: { ...pay.tracker, combatants: [{ ...TRK.combatants[0], hp: 99 }] } };
  bad.checksum = digest(bad);
  const before = s.listCampaigns().length;
  assert.throws(() => s.importPayload(bad, { mode: "new" }), (e) => e.errors?.some((x) => x.path.startsWith("tracker:")));
  assert.equal(s.listCampaigns().length, before, "nessuna campagna parziale");
  const tampered = { ...pay, tracker: { ...pay.tracker, round: 99 } }; // checksum non ricalcolato
  assert.throws(() => s.importPayload(tampered, { mode: "new" }), (e) => e.status === 422);
});

test("export leggibile: la sezione 'Combattimento in corso' compare solo se ci sono partecipanti", () => {
  const s = memStore();
  const { campaignId } = genInto(s, { seed: "md" });
  const c = s.getCampaign(campaignId), list = s.listEntities(campaignId);
  assert.doesNotMatch(campaignToMarkdown(c, list, { tracker: { round: 1, turn: 0, combatants: [] } }), /Combattimento in corso/);
  const md = campaignToMarkdown(c, list, { tracker: TRK });
  assert.match(md, /## Combattimento in corso/);
  assert.match(md, /▶ \*\*Lupo\*\* — iniziativa 12, PF 0\/11, CA 13 — ferito/);
  assert.match(md, /\*\*Mira\*\* \(PG\) — iniziativa 15, PF 9\/12, CA 14, condizioni: prono/);
  assert.ok(md.indexOf("Combattimento in corso") < md.indexOf("Fonti e licenze"));
});

// ---------------- unione dei conflitti (logica dell'interfaccia) ----------------
test("unione dei conflitti: campi diversi si uniscono, lo stesso campo è un conflitto, valori uguali no", () => {
  const F = ENTITY_TYPES.npc.fields;
  const base = { name: "Ada", personality: "calma", role: "fabbra", motivations: ["oro"], status: "vivo", location: null };
  const mine = { ...base, personality: "irosa", motivations: ["oro", "gloria"] };
  const theirs = { ...base, role: "capitana", motivations: ["vendetta"], status: "vivo" };
  const r = mergeForConflict(F, base, mine, theirs);
  assert.equal(r.merged.personality, "irosa", "modifica mia mantenuta");
  assert.equal(r.merged.role, "capitana", "modifica altrui presa");
  assert.deepEqual(r.conflicts.map((c) => c.f.k), ["motivations"]);
  assert.deepEqual(r.merged.motivations, ["oro", "gloria"], "nel conflitto la bozza resta la proposta predefinita");
  assert.ok(r.keptMine.includes("Personalità") && r.takenTheirs.includes("Ruolo"));
  // stessa modifica fatta da entrambi: nessun conflitto
  const same = mergeForConflict(F, base, { ...base, role: "capitana" }, theirs);
  assert.equal(same.conflicts.length, 0);
  // valori equivalenti dopo la normalizzazione (stringa vuota vs assente, null vs undefined) non sono modifiche
  const norm = mergeForConflict(F, { ...base, description: undefined }, { ...base, description: "" }, { ...base });
  assert.equal(norm.conflicts.length + norm.keptMine.length + norm.takenTheirs.length, 0);
  assert.equal(normField({ t: "int" }, ""), null);
  assert.equal(previewValue({ t: "refs" }, ["x", "y"], (id) => id.toUpperCase()), "X, Y");
  assert.ok(previewValue({ t: "text" }, "a".repeat(500)).length <= 220);
});

// ---------------- riepilogo di sessione ----------------
test("riepilogo di sessione: missioni, luoghi, PNG presenti, indizi con requisiti, prossimi eventi", () => {
  const s = memStore();
  const { campaignId } = genInto(s, { seed: "brief" });
  const c = s.getCampaign(campaignId), list = s.listEntities(campaignId);
  const cur = currentSession(list);
  assert.equal(cur.data.number, 1, "la sessione corrente è la prima non giocata");
  const b = sessionBrief(c, list, cur.id);
  assert.ok(b.quests.length >= 1);
  const locIds = new Set(b.locations.map((l) => l.id));
  for (const q of b.quests) for (const l of q.data.locations ?? []) assert.ok(locIds.has(l));
  for (const n of b.npcs) assert.equal(n.where, npcLocationOn(n.entity, c.currentDay));
  for (const q of b.quests) if (q.data.giver) assert.ok(b.npcs.some((n) => n.entity.id === q.data.giver), "il committente è tra i PNG");
  const t3 = b.clues.find((x) => x.entity.data.name === "I finanziamenti");
  assert.ok(t3, "indizio trovabile in un luogo della sessione");
  assert.ok(t3.after.length === 1, "richiede un altro indizio: mostrato come 'dopo'");
  assert.ok(b.upcoming.every((e) => !e.data.happened && e.data.day >= c.currentDay));
  assert.ok(b.upcoming.every((e, i) => i === 0 || b.upcoming[i - 1].data.day <= e.data.day));
  // giocata la prima, la corrente diventa la seconda; tutte giocate => l'ultima
  s.updateEntity(cur.id, { played: true });
  assert.equal(currentSession(s.listEntities(campaignId)).data.number, 2);
  for (const x of ents(s, campaignId, "session")) s.updateEntity(x.id, { played: true });
  assert.equal(currentSession(s.listEntities(campaignId)).data.number, ents(s, campaignId, "session").length);
  assert.throws(() => sessionBrief(c, list, b.quests[0].id), (e) => e.status === 404);
});

test("riepilogo di sessione: un indizio dietro una missione non completata è segnato come non ancora accessibile", () => {
  const s = memStore();
  const { campaignId } = genInto(s, { seed: "brief2" });
  const ses = ents(s, campaignId, "session")[0];
  const q = s.getEntity(ses.data.quests[0]);
  const blocker = byName(s, campaignId, "quest", "debito");
  const loc = q.data.locations[0];
  const clue = s.createEntity(campaignId, "clue", { name: "Indizio bloccato", text: "Serve prima il carico.", foundAtLocation: loc, requires: [blocker.id], truthful: true });
  let b = sessionBrief(s.getCampaign(campaignId), s.listEntities(campaignId), ses.id);
  assert.deepEqual(b.clues.find((x) => x.entity.id === clue.id).blockedBy, [blocker.id]);
  s.updateEntity(blocker.id, { status: "completata" });
  b = sessionBrief(s.getCampaign(campaignId), s.listEntities(campaignId), ses.id);
  assert.deepEqual(b.clues.find((x) => x.entity.id === clue.id).blockedBy, []);
});

test("scheda di sessione: Markdown e HTML stampabile con tutte le parti e testo sottoposto a escape", () => {
  const s = memStore();
  const { campaignId } = genInto(s, { seed: "sheet" });
  const ses = ents(s, campaignId, "session")[0];
  s.updateEntity(ses.id, { notes: "<script>alert(1)</script> attenzione" });
  const list = s.listEntities(campaignId);
  const b = sessionBrief(s.getCampaign(campaignId), list, ses.id);
  const md = sessionToMarkdown(b, list);
  for (const h of ["# Sessione 1:", "## Missioni", "## Scene e luoghi", "## PNG", "## Indizi ottenibili", "## Eventi della sessione", "## Prossimi eventi della campagna", "## Fonti e licenze"]) assert.ok(md.includes(h), h);
  const html = sessionToHtml(b, list);
  assert.match(html, /^<!doctype html>/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

// ---------------- annulla rigenerazione ----------------
test("annulla rigenerazione: torna alla versione precedente; rifiutato se l'ultima modifica non è una rigenerazione o la versione è cambiata", () => {
  const s = memStore();
  const { campaignId } = genInto(s, { seed: "undo" });
  const npc = ents(s, campaignId, "npc")[0];
  const before = npc.data.personality;
  assert.equal(s.lastRegeneration(npc.id), null);
  assert.throws(() => s.undoRegeneration(npc.id, npc.version), (e) => e.status === 409);
  const r = s.updateEntity(npc.id, { personality: "Rigenerata." }, { source: "deterministico", note: 'rigenerato "personality"' });
  assert.deepEqual(s.lastRegeneration(npc.id), { version: r.version, source: "deterministico", field: "personality" });
  assert.throws(() => s.undoRegeneration(npc.id, r.version - 1), (e) => e.status === 409, "versione attesa superata");
  const u = s.undoRegeneration(npc.id, r.version);
  assert.equal(u.data.personality, before);
  assert.equal(u.version, r.version + 1, "l'annullamento è una nuova versione: la rigenerazione resta nello storico");
  assert.match(s.revisions(npc.id)[0].note, /annullata rigenerazione "personality"/);
  assert.throws(() => s.undoRegeneration(npc.id, u.version), (e) => e.status === 409, "non si annulla due volte");
});

// ---------------- scheletri narrativi ----------------
test("strutture narrative: ogni struttura e tema, con 3-12 sessioni, è coerente e assegna ogni missione a una sessione", () => {
  for (const structure of Object.keys(STRUCTURES)) {
    for (const themeId of ["culto", "intrigo", "miniera", "peste", "fate", "pirati", "drago"]) {
      for (const [seed, sessions] of [["a", 3], ["b", 5], ["c", 8], ["d", 12]]) {
        const s = memStore();
        const { campaignId } = genInto(s, { seed, themeId, structure, sessions, startLevel: 1, endLevel: sessions >= 5 ? 5 : 3 });
        const r = checkCoherence(s.getCampaign(campaignId), s.listEntities(campaignId));
        const tag = `${structure}/${themeId}/${sessions}`;
        assert.deepEqual(r.summary, { errore: 0, rischio: 0, suggerimento: 0 }, `${tag}: ${JSON.stringify(r.issues.map((i) => i.message))}`);
        const ses = ents(s, campaignId, "session");
        assert.equal(ses.length, sessions, tag);
        const planned = new Set(ses.flatMap((x) => x.data.quests));
        for (const q of ents(s, campaignId, "quest")) assert.ok(planned.has(q.id), `${tag}: "${q.data.name}" senza sessione`);
      }
    }
  }
});

test("strutture narrative: differenze reali tra gli scheletri, determinismo e testi senza segnaposto", () => {
  const g = (structure) => generateCampaignBundle({ seed: "cfr", themeId: "culto", structure });
  const cls = g("classica"), ind = g("indagine"), sbx = g("sandbox"), esp = g("esplorazione");
  assert.deepEqual(g("indagine"), ind, "stesso seed e struttura => stesso risultato");
  const q = (b, k) => b.entities.find((e) => e.key === k)?.data;
  // indagine: nodi senza prerequisiti e almeno tre piste in più per il mistero
  assert.deepEqual(q(ind, "q_m2").prerequisites, []);
  assert.ok(q(ind, "mys_main").clues.length >= q(cls, "mys_main").clues.length + 3);
  // sandbox: fronti delle fazioni con scadenze crescenti prima della scadenza finale e una missione offerta dall'antagonista
  const fronts = ["evt_front1", "evt_front2", "evt_front3"].map((k) => q(sbx, k).day);
  assert.ok(fronts[0] < fronts[1] && fronts[1] < fronts[2] && fronts[2] < sbx.meta.ritualDay);
  assert.equal(q(sbx, "q_f1").giver, "npc_villain");
  // esplorazione: livello profondo bloccato fino alla missione del primo livello, con un dungeon in più e l'indizio decisivo
  assert.equal(q(esp, "loc_depths").unlockedBy, "q_e1");
  assert.equal(esp.entities.filter((e) => e.type === "dungeon").length, cls.entities.filter((e) => e.type === "dungeon").length + 1);
  assert.equal(q(esp, "clue_t4").foundAtLocation, "loc_depths");
  assert.ok(q(esp, "dng_depths").rooms.some((r) => r.clues?.includes("clue_t4")));
  assert.ok(!q(esp, "dng_ruin").rooms.some((r) => r.clues?.includes("clue_t4")), "l'indizio non resta anche al primo livello");
  assert.throws(() => generateCampaignBundle({ structure: "boh" }), /Struttura narrativa sconosciuta/);
  const bad = /\b(di|a|da|in|su) (il|lo|la|i|gli|le)\b |\{[a-zA-Z.]+\}|\[[a-z]\|[a-z]\]|undefined|\[object/;
  for (const structure of ["indagine", "sandbox", "esplorazione"]) for (const themeId of ["culto", "intrigo", "miniera", "peste", "fate", "pirati", "drago"]) {
    const b = generateCampaignBundle({ seed: "txt", themeId, structure });
    const texts = [];
    const walk = (v) => { if (typeof v === "string") texts.push(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") Object.values(v).forEach(walk); };
    walk(b.campaign); b.entities.forEach((e) => { if (e.type !== "dungeon") walk(e.data); });
    for (const t of texts) assert.ok(!bad.test(t + " "), `${structure}/${themeId}: «${t.slice(0, 160)}»`);
  }
});

// ---------------- API HTTP ----------------
const dir = tmpDir("dcs-feat-");
let app, base;
before(async () => {
  app = createApp({ dbFile: path.join(dir, "studio.sqlite"), backupDir: path.join(dir, "backups") });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${app.server.address().port}`;
});
after(async () => { app.server.closeAllConnections?.(); await new Promise((r) => app.server.close(r)); });
const call = async (method, url, body) => {
  const r = await fetch(base + url, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text, headers: r.headers };
};

test("API: struttura nella generazione (sconosciuta => 400), elenco strutture nello schema", async () => {
  const sc = await call("GET", "/api/schema");
  assert.deepEqual(Object.keys(sc.json.structures), ["classica", "indagine", "sandbox", "esplorazione"]);
  const bad = await call("POST", "/api/campaigns", { generate: true, params: { seed: "x", structure: "boh" } });
  assert.equal(bad.status, 400);
  assert.match(bad.json.error, /Struttura narrativa sconosciuta/);
  const ok = await call("POST", "/api/campaigns", { generate: true, params: { seed: "x", structure: "sandbox" } });
  assert.equal(ok.status, 201);
  assert.equal(ok.json.report.summary.errore, 0);
});

test("API: riepilogo e scheda della sessione; esportazione singola rifiutata per altri tipi", async () => {
  const c = (await call("POST", "/api/campaigns", { generate: true, params: { seed: "api-brief" } })).json.campaign;
  const list = (await call("GET", `/api/campaigns/${c.id}/entities`)).json;
  const ses = list.filter((e) => e.type === "session").sort((a, b) => a.data.number - b.data.number)[0];
  const br = await call("GET", `/api/entities/${ses.id}/brief`);
  assert.equal(br.status, 200);
  assert.equal(br.json.session.id, ses.id);
  const md = await call("GET", `/api/entities/${ses.id}/export?format=md`);
  assert.equal(md.status, 200);
  assert.match(md.headers.get("content-type"), /text\/markdown/);
  assert.match(md.headers.get("content-disposition") ?? "", /sessione-1/);
  const html = await call("GET", `/api/entities/${ses.id}/export?format=html&inline=1`);
  assert.match(html.text, /<h2>Indizi ottenibili<\/h2>/);
  assert.equal((await call("GET", `/api/entities/${ses.id}/export?format=svg`)).status, 400);
  const npc = list.find((e) => e.type === "npc");
  assert.equal((await call("GET", `/api/entities/${npc.id}/export?format=md`)).status, 400);
  assert.equal((await call("GET", `/api/entities/${npc.id}/brief`)).status, 404);
});

test("API: rigenerazione deterministica e annullamento in un passo", async () => {
  const c = (await call("POST", "/api/campaigns", { generate: true, params: { seed: "api-undo" } })).json.campaign;
  const npc = (await call("GET", `/api/campaigns/${c.id}/entities?type=npc`)).json[0];
  const rg = await call("POST", `/api/entities/${npc.id}/regenerate`, { field: "personality", provider: "deterministic", seed: 42 });
  assert.equal(rg.status, 200);
  const stale = await call("POST", `/api/entities/${npc.id}/undo-regenerate`, { expectedVersion: npc.version });
  assert.equal(stale.status, 409);
  const un = await call("POST", `/api/entities/${npc.id}/undo-regenerate`, { expectedVersion: rg.json.entity.version });
  assert.equal(un.status, 200);
  assert.equal(un.json.data.personality, npc.data.personality);
  assert.equal((await call("POST", `/api/entities/${npc.id}/undo-regenerate`, { expectedVersion: un.json.version })).status, 409);
});

test("API: export JSON con tracker e export Markdown con lo scontro in corso", async () => {
  const c = (await call("POST", "/api/campaigns", { generate: true, params: { seed: "api-trk" } })).json.campaign;
  const t = (await call("GET", `/api/campaigns/${c.id}/tracker`)).json;
  const put = await call("PUT", `/api/campaigns/${c.id}/tracker`, { ...TRK, expectedRev: t.rev });
  assert.equal(put.status, 200);
  const js = (await call("GET", `/api/campaigns/${c.id}/export?format=json`)).json;
  assert.deepEqual(js.tracker.combatants.map((x) => x.name), ["Mira", "Lupo"]);
  const md = (await call("GET", `/api/campaigns/${c.id}/export?format=md`)).text;
  assert.match(md, /## Combattimento in corso/);
  const imp = await call("POST", "/api/import", { payload: js });
  assert.equal(imp.status, 201);
  assert.deepEqual((await call("GET", `/api/campaigns/${imp.json.id}/tracker`)).json.combatants.map((x) => x.name), ["Mira", "Lupo"]);
});
