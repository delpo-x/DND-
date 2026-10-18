import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, currentVersion } from "./db.js";
import { Store, AppError } from "./store.js";
import { ValidationError, schemaForClient, SCHEMA_VERSION, ENTITY_TYPES } from "./schema.js";
import { generateCampaignBundle, regenerableFields, STRUCTURES } from "./gen-det.js";
import { THEMES } from "./content.js";
import { generateNpc, generateRandomEvent, generateLocation } from "./gen-extra.js";
import { generateDungeon, DUNGEON_LIMITS } from "./dungeon.js";
import { checkCoherence } from "./coherence.js";
import { campaignToMarkdown, campaignToHtml, dungeonExport, sessionToMarkdown, sessionToHtml } from "./export.js";
import { sessionBrief } from "./brief.js";
import { DEFAULT_AI_SETTINGS, AiError, validateAiSettings, makeProvider, DeterministicProvider } from "./ai.js";
import * as rules from "./rules.js";
import { normalizeTracker, trackerAction, EMPTY_TRACKER } from "./tracker.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(here, "..", "public");
export const APP_VERSION = "0.1.0";

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".ico": "image/x-icon" };

export function createApp({ dbFile, backupDir, fetchImpl } = {}) {
  const db = openDb(dbFile);
  const store = new Store(db, { backupDir });
  const aiSettings = () => ({ ...DEFAULT_AI_SETTINGS, ...(store.getSetting("ai", {}) ?? {}) });
  const provider = (override) => makeProvider(override ?? aiSettings(), fetchImpl);

  const routes = [];
  const route = (method, pattern, handler) => {
    const keys = [];
    const re = new RegExp("^" + pattern.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return "([^/]+)"; }) + "$");
    routes.push({ method, re, keys, handler });
  };
  const ok = (data, status = 200) => ({ status, data });
  /** Parametri di generazione dei dungeon validati prima di allocare la griglia (evita errori 500 e mappe enormi). */
  const dungeonParams = (body, defaultLevel) => {
    const out = {};
    for (const [k, def, label] of [["width", 48, "Larghezza"], ["height", 32, "Altezza"], ["rooms", 8, "Numero di stanze"], ["level", defaultLevel, "Livello"]]) {
      const v = Number(body[k] ?? def), [lo, hi] = DUNGEON_LIMITS[k];
      if (!Number.isInteger(v) || v < lo || v > hi) throw new AppError(`${label} non valido: intero tra ${lo} e ${hi}`);
      out[k] = v;
    }
    return out;
  };

  const campaignOf = (entityId) => store.getEntity(entityId).campaignId;
  const loadAll = (cid) => store.listEntities(cid).concat(store.listEntities(cid, { deleted: true }));
  const report = (cid) => checkCoherence(store.getCampaign(cid), loadAll(cid));

  // ---- stato e configurazione ----
  route("GET", "/api/status", async () => {
    const p = provider();
    return ok({
      app: "D&D Campaign Studio", version: APP_VERSION, node: process.version, appSchemaVersion: SCHEMA_VERSION, dbSchemaVersion: currentVersion(db),
      rulesVersion: rules.RULES_VERSION, ai: await p.status(), aiSettings: aiSettings(), backupDir,
    });
  });
  route("GET", "/api/schema", async () => ok({ ...schemaForClient(), regenerableDeterministic: regenerableFields(), structures: STRUCTURES }));
  route("GET", "/api/settings/ai", async () => ok(aiSettings()));
  route("PUT", "/api/settings/ai", async ({ body }) => {
    const s = validateAiSettings({ ...aiSettings(), ...body });
    store.setSetting("ai", s);
    return ok({ settings: s, status: await provider(s).status() });
  });
  route("POST", "/api/ai/test", async () => ok(await provider().status()));

  // ---- regole ----
  route("GET", "/api/rules/info", async () => ok({
    version: rules.RULES_VERSION, sources: rules.RULES_SOURCES, xpBudget: rules.XP_BUDGET, xpToLevel: rules.XP_TO_LEVEL,
    creatureTypes: rules.creatureTypes(), creatureCount: rules.loadCreatures().creatures.length, fetched: rules.loadCreatures().fetched, difficulties: rules.DIFFICULTIES,
  }));
  route("GET", "/api/rules/creatures", async ({ query }) => ok(rules.searchCreatures({ q: query.q, type: query.type, minCr: query.minCr, maxCr: query.maxCr, limit: Number(query.limit ?? 100) })));
  route("POST", "/api/rules/encounter", async ({ body }) => {
    const { Rng } = await import("./rng.js");
    const level = Number(body.level), players = Number(body.players);
    if (!Number.isInteger(level) || level < 1 || level > 20) throw new AppError("Livello non valido (1-20)");
    if (!Number.isInteger(players) || players < 1 || players > 12) throw new AppError("Numero di giocatori non valido (1-12)");
    return ok(rules.buildEncounter(new Rng(`enc:${body.seed ?? Date.now()}`), { level, players, difficulty: body.difficulty ?? "moderata", types: body.types, boss: !!body.boss }));
  });

  // ---- campagne ----
  route("GET", "/api/campaigns", async () => ok(store.listCampaigns()));
  route("POST", "/api/campaigns", async ({ body }) => {
    if (body.generate) {
      const params = body.params ?? {};
      if (params.themeId !== undefined && !THEMES.some((t) => t.id === params.themeId)) throw new AppError(`Tema sconosciuto: ${params.themeId}. Valori ammessi: ${THEMES.map((t) => t.id).join(", ")}.`);
      if (params.structure !== undefined && !Object.hasOwn(STRUCTURES, params.structure)) throw new AppError(`Struttura narrativa sconosciuta: ${params.structure}. Valori ammessi: ${Object.keys(STRUCTURES).join(", ")}.`);
      const bundle = generateCampaignBundle(params);
      const r = store.importBundle({ campaign: bundle.campaign, entities: bundle.entities }, { source: "generatore deterministico" });
      return ok({ campaign: store.getCampaign(r.campaignId), report: report(r.campaignId), theme: bundle.meta.theme }, 201);
    }
    return ok(store.createCampaign(body.data ?? body), 201);
  });
  route("GET", "/api/campaigns/:id", async ({ params }) => ok(store.getCampaign(params.id)));
  route("PUT", "/api/campaigns/:id", async ({ params, body }) => {
    const { expectedVersion, ...data } = body;
    return ok(store.updateCampaign(params.id, data, { expectedVersion }));
  });
  route("POST", "/api/campaigns/:id/duplicate", async ({ params }) => ok(store.duplicateCampaign(params.id), 201));
  route("POST", "/api/campaigns/:id/archive", async ({ params, body }) => ok(store.setArchived(params.id, body.archived !== false)));
  route("DELETE", "/api/campaigns/:id", async ({ params, body }) => ok(store.deleteCampaign(params.id, body.confirmTitle)));
  route("GET", "/api/campaigns/:id/entities", async ({ params, query }) => ok(store.listEntities(params.id, { type: query.type, q: query.q, deleted: query.deleted === "1" })));
  route("POST", "/api/campaigns/:id/entities", async ({ params, body }) => ok(store.createEntity(params.id, body.type, body.data), 201));
  const loadTracker = (cid) => { store.getCampaign(cid); return normalizeTracker(store.getSetting(`tracker:${cid}`, EMPTY_TRACKER)); };
  const saveTracker = (cid, t, prev) => { const next = { ...t, rev: prev.rev + 1 }; store.setSetting(`tracker:${cid}`, next); return next; };
  route("GET", "/api/campaigns/:id/tracker", async ({ params }) => ok(loadTracker(params.id)));
  route("PUT", "/api/campaigns/:id/tracker", async ({ params, body }) => {
    const cur = loadTracker(params.id);
    // Sostituzione dell'intero stato: rifiutata se il client parte da una revisione superata (altra scheda).
    if (body.expectedRev !== undefined && body.expectedRev !== cur.rev)
      throw new AppError("Il tracker è stato modificato altrove: ricarica prima di salvare.", 409, { currentRev: cur.rev });
    const { expectedRev, ...state } = body;
    return ok(saveTracker(params.id, normalizeTracker(state), cur));
  });
  route("POST", "/api/campaigns/:id/tracker/action", async ({ params, body }) => {
    const cur = loadTracker(params.id);
    return ok(saveTracker(params.id, trackerAction(cur, body), cur));
  });
  route("GET", "/api/campaigns/:id/graph", async ({ params }) => ok(store.graph(params.id)));
  route("GET", "/api/campaigns/:id/history", async ({ params, query }) => ok(store.history(params.id, Number(query.limit ?? 100))));
  route("GET", "/api/campaigns/:id/check", async ({ params }) => ok(report(params.id)));
  route("POST", "/api/campaigns/:id/generate", async ({ params, body }) => {
    const seed = String(body.seed ?? Date.now());
    const cid = params.id;
    let type, data;
    if (body.kind === "npc") { type = "npc"; data = generateNpc({ seed, locationId: body.locationId ?? null, factionId: body.factionId ?? null }); }
    else if (body.kind === "event") { type = "event"; data = generateRandomEvent({ seed, locationId: body.locationId ?? null, day: store.getCampaign(cid).currentDay }); }
    else if (body.kind === "location") { type = "location"; data = generateLocation({ seed, parentId: body.parentId ?? null }); }
    else if (body.kind === "dungeon") {
      const c = store.getCampaign(cid);
      type = "dungeon";
      const d = generateDungeon({ seed, ...dungeonParams(body, c.startLevel), players: c.players, danger: c.danger, name: body.name || `Dungeon ${seed}` });
      data = { ...d, location: body.locationId ?? null };
    } else throw new AppError("Tipo di generazione non supportato: usa npc, event, location o dungeon");
    const e = store.createEntity(cid, type, data, { source: "generatore deterministico", note: `seed ${seed}` });
    return ok({ entity: e, seed }, 201);
  });
  route("GET", "/api/campaigns/:id/export", async ({ params, query }) => {
    const c = store.getCampaign(params.id);
    const fmt = query.format ?? "json";
    const slug = c.title.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 50);
    if (fmt === "json") return { status: 200, raw: JSON.stringify(store.exportPayload(params.id), null, 2), type: "application/json", filename: `${slug}.json` };
    const ents = store.listEntities(params.id);
    const opts = { tracker: loadTracker(params.id) };
    if (fmt === "md") return { status: 200, raw: campaignToMarkdown(c, ents, opts), type: "text/markdown; charset=utf-8", filename: `${slug}.md` };
    if (fmt === "html") return { status: 200, raw: campaignToHtml(c, ents, opts), type: "text/html; charset=utf-8", filename: query.inline ? undefined : `${slug}.html` };
    throw new AppError("Formato non supportato: json, md o html");
  });
  route("POST", "/api/campaigns/:id/backup", async ({ params }) => ok(store.createBackup(params.id), 201));
  route("GET", "/api/backups", async () => ok(store.listBackups()));
  route("POST", "/api/backups/restore", async ({ body }) => ok(store.restoreBackup(String(body.file))));
  route("POST", "/api/import", async ({ body }) => ok(store.importPayload(body.payload ?? body, { mode: "new" }), 201));

  // ---- entità ----
  route("GET", "/api/entities/:id", async ({ params }) => ok(store.getEntity(params.id)));
  route("PUT", "/api/entities/:id", async ({ params, body }) => ok(store.updateEntity(params.id, body.data ?? body, { expectedVersion: body.expectedVersion, note: body.note })));
  route("DELETE", "/api/entities/:id", async ({ params }) => ok(store.trashEntity(params.id)));
  route("POST", "/api/entities/:id/restore", async ({ params }) => ok(store.restoreEntity(params.id)));
  route("POST", "/api/entities/:id/purge", async ({ params, body }) => ok(store.purgeEntity(params.id, body.confirmName)));
  route("GET", "/api/entities/:id/inbound", async ({ params }) => ok(store.inboundRefs(params.id)));
  route("GET", "/api/entities/:id/revisions", async ({ params }) => ok(store.revisions(params.id)));
  route("GET", "/api/entities/:id/revisions/:v", async ({ params }) => ok(store.revisionData(params.id, Number(params.v))));
  route("POST", "/api/entities/:id/revisions/:v/restore", async ({ params }) => ok(store.restoreRevision(params.id, Number(params.v))));
  route("GET", "/api/entities/:id/brief", async ({ params }) => {
    const e = store.getEntity(params.id);
    return ok(sessionBrief(store.getCampaign(e.campaignId), store.listEntities(e.campaignId), e.id));
  });
  route("POST", "/api/entities/:id/undo-regenerate", async ({ params, body }) => ok(store.undoRegeneration(params.id, body.expectedVersion)));
  route("POST", "/api/entities/:id/apply",async ({ params }) => ok(store.applyEvent(params.id)));
  route("GET", "/api/entities/:id/export", async ({ params, query }) => {
    const e = store.getEntity(params.id);
    if (e.type === "session") {
      const ents = store.listEntities(e.campaignId);
      const brief = sessionBrief(store.getCampaign(e.campaignId), ents, e.id);
      const slug = `sessione-${e.data.number}-${e.data.name}`.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 60);
      if (query.format === "md") return { status: 200, raw: sessionToMarkdown(brief, ents), type: "text/markdown; charset=utf-8", filename: `${slug}.md` };
      if (query.format === "html") return { status: 200, raw: sessionToHtml(brief, ents), type: "text/html; charset=utf-8", filename: query.inline ? undefined : `${slug}.html` };
      throw new AppError("Formato non supportato: md o html");
    }
    if (e.type !== "dungeon") throw new AppError("Esportazione singola disponibile solo per dungeon e sessioni");
    const x = dungeonExport(e);
    const slug = e.data.name.replace(/[^\p{L}\p{N}]+/gu, "-");
    if (query.format === "svg") return { status: 200, raw: x.svg, type: "image/svg+xml", filename: `${slug}.svg` };
    if (query.format === "md") return { status: 200, raw: x.markdown, type: "text/markdown; charset=utf-8", filename: `${slug}.md` };
    throw new AppError("Formato non supportato: svg o md");
  });
  route("POST", "/api/entities/:id/regenerate", async ({ params, body }) => {
    const e = store.getEntity(params.id);
    const field = String(body.field ?? "");
    if (!ENTITY_TYPES[e.type].fields.some((f) => f.k === field)) throw new AppError("Campo sconosciuto");
    const settings = aiSettings();
    const which = body.provider ?? settings.provider;
    const p = which === "ollama" ? provider({ ...settings, provider: "ollama" }) : new DeterministicProvider();
    if (!p.supports(e.type, field)) throw new AppError(which === "ollama" ? "Campo non rigenerabile" : `La modalità deterministica non rigenera il campo "${field}" di tipo ${e.type}. Campi supportati: ${regenerableFields().join(", ")}.`);
    const seed = body.seed ?? Date.now();
    // Se il generatore fallisce, nulla viene scritto (la scrittura avviene solo dopo l'esito positivo).
    const value = await p.writeField(e, field, { seed, campaign: store.getCampaign(e.campaignId) });
    const updated = store.updateEntity(e.id, { [field]: value }, { source: which === "ollama" ? "ia:ollama" : "deterministico", note: `rigenerato "${field}"` });
    return ok({ entity: updated, provider: which });
  });

  route("POST", "/api/dungeon/preview", async ({ body }) => {
    const players = Number(body.players ?? 4);
    if (!Number.isInteger(players) || players < 1 || players > 12) throw new AppError("Numero di giocatori non valido (1-12)");
    return ok(generateDungeon({ seed: body.seed ?? Date.now(), ...dungeonParams(body, 1), players, danger: body.danger ?? "medio", name: body.name }));
  });

  // ---- gestione richieste ----
  async function readBody(req, limit = 5_000_000) {
    const chunks = []; let size = 0;
    for await (const c of req) { size += c.length; if (size > limit) throw new AppError("Richiesta troppo grande", 413); chunks.push(c); }
    if (!size) return {};
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new AppError("JSON non valido nel corpo della richiesta", 400); }
  }
  function send(res, status, body, headers = {}) {
    res.writeHead(status, { "cache-control": "no-store", "x-content-type-options": "nosniff", ...headers });
    res.end(body);
  }
  const json = (res, status, data) => send(res, status, JSON.stringify(data), { "content-type": "application/json; charset=utf-8" });

  const server = http.createServer(async (req, res) => {
    try {
      // Difesa da DNS rebinding / richieste cross-site: solo host locale e stessa origine.
      const host = (req.headers.host ?? "").replace(/:\d+$/, "");
      if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) return json(res, 403, { error: "Host non consentito" });
      if (req.method !== "GET" && req.method !== "HEAD") {
        const origin = req.headers.origin;
        // "null" (iframe sandbox, file://) o valori non interpretabili: rifiutati come origini estranee.
        let originHost = null;
        try { originHost = origin ? new URL(origin).host : null; } catch { originHost = ""; }
        if (origin && originHost !== req.headers.host) return json(res, 403, { error: "Origine non consentita" });
      }
      const url = new URL(req.url, "http://localhost");
      const decode = (s) => { try { return decodeURIComponent(s); } catch { throw new AppError("Indirizzo non valido (codifica % errata)", 400); } };
      if (url.pathname.startsWith("/api/")) {
        for (const r of routes) {
          if (r.method !== req.method) continue;
          const m = r.re.exec(url.pathname);
          if (!m) continue;
          const params = Object.fromEntries(r.keys.map((k, i) => [k, decode(m[i + 1])]));
          const body = req.method === "GET" ? {} : await readBody(req);
          const out = await r.handler({ params, query: Object.fromEntries(url.searchParams), body });
          if (out.raw !== undefined) {
            const h = { "content-type": out.type };
            if (out.filename) h["content-disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(out.filename)}`;
            return send(res, out.status, out.raw, h);
          }
          return json(res, out.status, out.data);
        }
        return json(res, 404, { error: "Endpoint non trovato" });
      }
      // statici
      let rel = decode(url.pathname);
      if (rel === "/") rel = "/index.html";
      if (rel.includes("\0")) return json(res, 400, { error: "Percorso non valido" });
      const full = path.normalize(path.join(PUBLIC_DIR, rel));
      if (!full.startsWith(PUBLIC_DIR + path.sep) && full !== PUBLIC_DIR) return json(res, 403, { error: "Percorso non consentito" });
      if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) return json(res, 404, { error: "Non trovato" });
      return send(res, 200, fs.readFileSync(full), { "content-type": MIME[path.extname(full)] ?? "application/octet-stream" });
    } catch (e) {
      if (e instanceof ValidationError) return json(res, 422, { error: e.message, validation: e.errors });
      if (e instanceof AppError || e instanceof AiError) return json(res, e.status ?? 400, { error: e.message, code: e.code, details: e.details });
      console.error("Errore interno:", e);
      return json(res, 500, { error: "Errore interno: " + e.message });
    }
  });
  server.on("close", () => { try { db.close(); } catch { /* già chiuso */ } });
  return { server, store, db, loadAll };
}

// ---- avvio da riga di comando ----
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 4173);
  const root = path.resolve(process.env.STUDIO_DATA ?? path.join(here, "..", "storage"));
  const { server } = createApp({ dbFile: path.join(root, "studio.sqlite"), backupDir: path.join(root, "backups") });
  server.on("error", (e) => {
    console.error(e.code === "EADDRINUSE" ? `Porta ${port} già in uso. Imposta un'altra porta con la variabile PORT (es. $env:PORT=4200).` : `Errore del server: ${e.message}`);
    process.exit(1);
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`D&D Campaign Studio ${APP_VERSION} in ascolto su http://localhost:${port}`);
    console.log(`Dati: ${root}`);
  });
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { console.log("\nChiusura in corso…"); server.close(() => process.exit(0)); });
}
