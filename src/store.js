import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { tx } from "./db.js";
import { ENTITY_TYPES, CAMPAIGN_FIELDS, SCHEMA_VERSION, validateAgainst, extractRefs, ValidationError, searchableText } from "./schema.js";
import { dungeonDataErrors } from "./dungeon.js";
import { normalizeTracker } from "./tracker.js";

/** Validazione completa di un elemento: tipi dello schema + vincoli interni specifici del tipo. */
function validateEntity(type, data, resolveRef) {
  const clean = validateAgainst(ENTITY_TYPES[type].fields, data, resolveRef);
  if (type === "dungeon") { const errs = dungeonDataErrors(clean); if (errs.length) throw new ValidationError(errs); }
  return clean;
}

// Nomi dei file di backup: lettere e cifre di qualunque alfabeto (come quelle usate da createBackup), _ . -
const BACKUP_NAME = /^[\p{L}\p{N}_.-]+\.json$/u;

export class AppError extends Error {
  constructor(message, status = 400, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const now = () => new Date().toISOString();
const newId = (prefix) => `${prefix}_${crypto.randomBytes(5).toString("hex")}`;
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const parse = (s) => JSON.parse(s);
/** Checksum di un file esportato: copre campagna, elementi e, se presente, lo stato del tracker (i file senza tracker restano validi). */
const payloadDigest = (p) => sha256(JSON.stringify(p.tracker !== undefined ? { campaign: p.campaign, entities: p.entities, tracker: p.tracker } : { campaign: p.campaign, entities: p.entities }));

/** Sostituisce ogni id di riferimento con fn(id) camminando lo schema. Restituisce una copia. */
export function mapRefs(fields, data, fn) {
  const out = { ...data };
  for (const f of fields) {
    const v = data?.[f.k];
    if (v == null) continue;
    if (f.t === "ref" && typeof v === "string") out[f.k] = fn(v);
    else if (f.t === "refs" && Array.isArray(v)) out[f.k] = v.map(fn);
    else if (f.t === "list" && Array.isArray(v)) out[f.k] = v.map((it) => mapRefs(f.fields, it, fn));
  }
  return out;
}

export class Store {
  constructor(db, { backupDir } = {}) {
    this.db = db;
    this.backupDir = backupDir;
  }

  // ---------- impostazioni ----------
  getSetting(key, def = null) {
    const r = this.db.prepare("SELECT value FROM settings WHERE key=?").get(key);
    return r ? parse(r.value) : def;
  }
  setSetting(key, value) {
    this.db.prepare("INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, JSON.stringify(value));
  }

  // ---------- campagne ----------
  listCampaigns({ includeArchived = true } = {}) {
    const rows = this.db.prepare("SELECT * FROM campaigns ORDER BY archived, updated_at DESC").all();
    return rows
      .filter((r) => includeArchived || !r.archived)
      .map((r) => ({ ...this.#campaignRow(r), counts: this.#counts(r.id) }));
  }
  #counts(campaignId) {
    const out = {};
    for (const r of this.db.prepare("SELECT type, COUNT(*) AS n FROM entities WHERE campaign_id=? AND deleted_at IS NULL GROUP BY type").all(campaignId)) out[r.type] = r.n;
    return out;
  }
  #campaignRow(r) {
    return { id: r.id, archived: !!r.archived, createdAt: r.created_at, updatedAt: r.updated_at, version: r.version, ...parse(r.data) };
  }
  getCampaign(id) {
    const r = this.db.prepare("SELECT * FROM campaigns WHERE id=?").get(id);
    if (!r) throw new AppError("Campagna non trovata", 404);
    return { ...this.#campaignRow(r), counts: this.#counts(id) };
  }
  createCampaign(data, { source = "manuale", id } = {}) {
    const clean = validateAgainst(CAMPAIGN_FIELDS, data, () => null);
    if (clean.endLevel < clean.startLevel) throw new ValidationError([{ path: "endLevel", message: "il livello finale non può essere inferiore a quello iniziale" }]);
    const cid = id ?? newId("camp");
    const t = now();
    tx(this.db, () => {
      this.db.prepare("INSERT INTO campaigns(id,title,data,archived,created_at,updated_at,version) VALUES (?,?,?,?,?,?,1)").run(cid, clean.title, JSON.stringify(clean), 0, t, t);
      this.#revision(cid, cid, "campaign", 1, clean.title, clean, source);
    });
    return this.getCampaign(cid);
  }
  updateCampaign(id, data, { source = "manuale", note, expectedVersion } = {}) {
    const cur = this.getCampaign(id);
    const { id: _i, archived, createdAt, updatedAt, version, counts, ...curData } = cur;
    if (expectedVersion !== undefined && expectedVersion !== version)
      throw new AppError("La campagna è stata modificata altrove: ricarica prima di salvare.", 409, { currentVersion: version });
    const clean = validateAgainst(CAMPAIGN_FIELDS, { ...curData, ...data }, () => null);
    if (clean.endLevel < clean.startLevel) throw new ValidationError([{ path: "endLevel", message: "il livello finale non può essere inferiore a quello iniziale" }]);
    tx(this.db, () => {
      this.db.prepare("UPDATE campaigns SET title=?, data=?, updated_at=?, version=version+1 WHERE id=?").run(clean.title, JSON.stringify(clean), this.#nextStamp(id), id);
      this.#revision(id, id, "campaign", version + 1, clean.title, clean, source, note);
    });
    return this.getCampaign(id);
  }
  setArchived(id, archived) {
    this.getCampaign(id);
    this.db.prepare("UPDATE campaigns SET archived=?, updated_at=? WHERE id=?").run(archived ? 1 : 0, this.#nextStamp(id), id);
    return this.getCampaign(id);
  }
  duplicateCampaign(id) {
    const payload = this.exportPayload(id);
    return this.importPayload(payload, { mode: "new", title: payload.campaign.title + " (copia)" });
  }
  /** Elimina definitivamente. Richiede il titolo esatto e crea prima un backup. */
  deleteCampaign(id, confirmTitle) {
    const c = this.getCampaign(id);
    if (confirmTitle !== c.title) throw new AppError("Conferma non valida: digita il titolo esatto della campagna per eliminarla.", 409);
    const backup = this.createBackup(id, "pre-eliminazione");
    this.db.prepare("DELETE FROM campaigns WHERE id=?").run(id);
    this.db.prepare("DELETE FROM settings WHERE key=?").run(`tracker:${id}`);
    return { deleted: id, backup: backup.file };
  }

  // ---------- entità ----------
  #resolver(campaignId, extra = new Map()) {
    const stmt = this.db.prepare("SELECT type FROM entities WHERE id=? AND campaign_id=? AND deleted_at IS NULL");
    return (rid) => extra.get(rid) ?? stmt.get(rid, campaignId)?.type ?? null;
  }
  #row(r) {
    return {
      id: r.id, campaignId: r.campaign_id, type: r.type, version: r.version,
      deleted: !!r.deleted_at, createdAt: r.created_at, updatedAt: r.updated_at, data: parse(r.data),
    };
  }
  getEntity(id) {
    const r = this.db.prepare("SELECT * FROM entities WHERE id=?").get(id);
    if (!r) throw new AppError("Elemento non trovato", 404);
    return this.#row(r);
  }
  listEntities(campaignId, { type, q, deleted = false } = {}) {
    this.getCampaign(campaignId);
    let sql = "SELECT * FROM entities WHERE campaign_id=? AND " + (deleted ? "deleted_at IS NOT NULL" : "deleted_at IS NULL");
    const args = [campaignId];
    if (type) { sql += " AND type=?"; args.push(type); }
    sql += " ORDER BY type, name COLLATE NOCASE";
    const rows = this.db.prepare(sql).all(...args).map((r) => this.#row(r));
    if (!q) return rows;
    // Ricerca nel testo leggibile (non in chiavi JSON né id), senza distinguere maiuscole anche per le lettere accentate.
    const needle = String(q).toLocaleLowerCase("it");
    return rows.filter((e) => searchableText(ENTITY_TYPES[e.type]?.fields ?? [], e.data).includes(needle));
  }
  #revision(campaignId, entityId, kind, version, name, data, source, note) {
    this.db.prepare("INSERT INTO revisions(campaign_id,entity_id,kind,version,name,data,source,note,at) VALUES (?,?,?,?,?,?,?,?,?)")
      .run(campaignId, entityId, kind, version, name, JSON.stringify(data), source, note ?? null, now());
  }
  #writeRelations(campaignId, entityId, type, data) {
    this.db.prepare("DELETE FROM relations WHERE from_id=?").run(entityId);
    const ins = this.db.prepare("INSERT INTO relations(campaign_id,from_id,to_id,field) VALUES (?,?,?,?)");
    for (const r of extractRefs(ENTITY_TYPES[type].fields, data)) ins.run(campaignId, entityId, r.id, r.field);
  }
  createEntity(campaignId, type, data, { source = "manuale", note, id } = {}) {
    this.getCampaign(campaignId);
    const def = ENTITY_TYPES[type];
    if (!def) throw new AppError(`Tipo di elemento sconosciuto: ${type}`);
    const clean = validateEntity(type, data, this.#resolver(campaignId));
    const eid = id ?? newId(type.slice(0, 3));
    const t = now();
    tx(this.db, () => {
      this.db.prepare("INSERT INTO entities(id,campaign_id,type,name,data,version,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?)").run(eid, campaignId, type, clean.name, JSON.stringify(clean), t, t);
      this.#writeRelations(campaignId, eid, type, clean);
      this.#revision(campaignId, eid, type, 1, clean.name, clean, source, note);
      this.#touch(campaignId);
    });
    return this.getEntity(eid);
  }
  /**
   * updated_at della campagna cresce in modo strettamente monotono a ogni modifica (anche due nello stesso millisecondo):
   * l'interfaccia lo usa per decidere se riscaricare gli elementi.
   */
  #nextStamp(campaignId) {
    const prev = this.db.prepare("SELECT updated_at FROM campaigns WHERE id=?").get(campaignId)?.updated_at;
    const t = Date.now(), p = prev ? Date.parse(prev) : 0;
    return new Date(Math.max(t, p + 1)).toISOString();
  }
  #touch(campaignId) {
    this.db.prepare("UPDATE campaigns SET updated_at=? WHERE id=?").run(this.#nextStamp(campaignId), campaignId);
  }
  updateEntity(id, data, { source = "manuale", note, expectedVersion } = {}) {
    const cur = this.getEntity(id);
    if (cur.deleted) throw new AppError("L'elemento è nel cestino: ripristinalo prima di modificarlo.", 409);
    if (expectedVersion !== undefined && expectedVersion !== cur.version)
      throw new AppError("L'elemento è stato modificato altrove: ricarica prima di salvare.", 409, { currentVersion: cur.version });
    const clean = validateEntity(cur.type, { ...cur.data, ...data }, this.#resolver(cur.campaignId));
    const v = cur.version + 1;
    tx(this.db, () => {
      this.db.prepare("UPDATE entities SET name=?, data=?, version=?, updated_at=? WHERE id=?").run(clean.name, JSON.stringify(clean), v, now(), id);
      this.#writeRelations(cur.campaignId, id, cur.type, clean);
      this.#revision(cur.campaignId, id, cur.type, v, clean.name, clean, source, note);
      this.#touch(cur.campaignId);
    });
    return this.getEntity(id);
  }
  inboundRefs(id, { includeDeleted = false } = {}) {
    const rows = this.db.prepare(
      `SELECT r.field, e.id, e.type, e.name, e.deleted_at FROM relations r JOIN entities e ON e.id=r.from_id WHERE r.to_id=? ${includeDeleted ? "" : "AND e.deleted_at IS NULL"}`
    ).all(id);
    return rows.map((r) => ({ id: r.id, type: r.type, name: r.name, field: r.field, deleted: !!r.deleted_at }));
  }
  trashEntity(id) {
    const e = this.getEntity(id);
    if (e.deleted) return e;
    const inbound = this.inboundRefs(id).filter((r) => r.id !== id);
    if (inbound.length)
      throw new AppError("Impossibile eliminare: l'elemento è ancora referenziato da altri elementi. Rimuovi prima i collegamenti.", 409, { inbound });
    this.db.prepare("UPDATE entities SET deleted_at=?, updated_at=? WHERE id=?").run(now(), now(), id);
    this.#touch(e.campaignId);
    return this.getEntity(id);
  }
  restoreEntity(id) {
    const e = this.getEntity(id);
    if (!e.deleted) return e;
    const res = this.#resolver(e.campaignId);
    const broken = extractRefs(ENTITY_TYPES[e.type].fields, e.data).filter((r) => !res(r.id));
    if (broken.length) throw new AppError("Impossibile ripristinare: alcuni riferimenti puntano a elementi eliminati.", 409, { broken });
    this.db.prepare("UPDATE entities SET deleted_at=NULL, updated_at=? WHERE id=?").run(now(), id);
    this.#touch(e.campaignId);
    return this.getEntity(id);
  }
  purgeEntity(id, confirmName) {
    const e = this.getEntity(id);
    if (!e.deleted) throw new AppError("Solo gli elementi nel cestino possono essere eliminati definitivamente.", 409);
    if (confirmName !== e.data.name) throw new AppError("Conferma non valida: digita il nome esatto.", 409);
    const inbound = this.inboundRefs(id, { includeDeleted: true });
    if (inbound.length) throw new AppError("Ancora referenziato da altri elementi (anche nel cestino).", 409, { inbound });
    this.createBackup(e.campaignId, "pre-purge");
    this.db.prepare("DELETE FROM entities WHERE id=?").run(id);
    this.#touch(e.campaignId);
    return { purged: id };
  }
  revisions(entityId) {
    return this.db.prepare("SELECT id,version,name,source,note,at FROM revisions WHERE entity_id=? ORDER BY version DESC").all(entityId);
  }
  revisionData(entityId, version) {
    const r = this.db.prepare("SELECT data FROM revisions WHERE entity_id=? AND version=?").get(entityId, version);
    if (!r) throw new AppError("Versione non trovata", 404);
    return parse(r.data);
  }
  restoreRevision(entityId, version) {
    const data = this.revisionData(entityId, version);
    return this.updateEntity(entityId, data, { source: "ripristino", note: `ripristinata versione ${version}` });
  }
  /** Ultima revisione, se è una rigenerazione di campo (IA o deterministica) annullabile; altrimenti null. */
  lastRegeneration(entityId) {
    const r = this.db.prepare("SELECT version,source,note FROM revisions WHERE entity_id=? ORDER BY version DESC LIMIT 1").get(entityId);
    if (!r || r.version < 2 || !["ia:ollama", "deterministico"].includes(r.source) || !/^rigenerato "/.test(r.note ?? "")) return null;
    return { version: r.version, source: r.source, field: r.note.match(/^rigenerato "([^"]+)"/)?.[1] ?? null };
  }
  /**
   * Annulla in un passo l'ultima rigenerazione: torna ai dati della versione precedente.
   * Rifiuta (409) se l'ultima modifica non è una rigenerazione o se l'elemento è cambiato rispetto a expectedVersion.
   */
  undoRegeneration(entityId, expectedVersion) {
    const cur = this.getEntity(entityId);
    const last = this.lastRegeneration(entityId);
    if (!last || last.version !== cur.version) throw new AppError("L'ultima modifica non è una rigenerazione: niente da annullare (usa lo storico delle versioni).", 409);
    const data = this.revisionData(entityId, cur.version - 1);
    return this.updateEntity(entityId, data, { source: "ripristino", note: `annullata rigenerazione${last.field ? ` "${last.field}"` : ""}`, expectedVersion });
  }
  history(campaignId, limit = 100) {
    this.getCampaign(campaignId);
    return this.db.prepare("SELECT id,entity_id AS entityId,kind,version,name,source,note,at FROM revisions WHERE campaign_id=? ORDER BY id DESC LIMIT ?").all(campaignId, limit);
  }
  graph(campaignId) {
    const nodes = this.listEntities(campaignId).map((e) => ({ id: e.id, type: e.type, name: e.data.name }));
    const ids = new Set(nodes.map((n) => n.id));
    const edges = this.db.prepare("SELECT from_id AS source, to_id AS target, field FROM relations WHERE campaign_id=?").all(campaignId)
      .filter((e) => ids.has(e.source) && ids.has(e.target));
    return { nodes, edges };
  }

  /** Applica gli effetti di un evento, lo segna come accaduto. Atomico: o tutto o niente. */
  applyEvent(eventId) {
    const ev = this.getEntity(eventId);
    if (ev.type !== "event") throw new AppError("Non è un evento");
    if (ev.data.happened) throw new AppError("Evento già applicato.", 409);
    const applied = [];
    tx(this.db, () => {
      for (const ef of ev.data.effects) {
        if (!ef.target || ef.kind === "nota") { applied.push({ ...ef, note: "nessuna modifica automatica" }); continue; }
        const t = this.getEntity(ef.target);
        const patch = {};
        if (ef.kind === "npcStatus" && t.type === "npc") patch.status = ef.value;
        else if (ef.kind === "npcLocation" && t.type === "npc") patch.location = ef.valueRef ?? (() => { throw new AppError('npcLocation richiede un luogo'); })();
        else if (ef.kind === "factionStanding" && t.type === "faction") patch.standing = Number(ef.value);
        else if (ef.kind === "questStatus" && t.type === "quest") patch.status = ef.value;
        else if (ef.kind === "locationAccess" && t.type === "location") patch.access = ef.value;
        else throw new AppError(`Effetto incompatibile: ${ef.kind} su ${t.type} "${t.data.name}"`);
        this.updateEntity(t.id, patch, { source: "evento", note: `da evento "${ev.data.name}"` });
        applied.push({ ...ef, ok: true });
      }
      this.updateEntity(eventId, { happened: true }, { source: "evento", note: "applicato" });
    });
    return { event: this.getEntity(eventId), applied };
  }

  // ---------- generatori: import atomico di bundle ----------
  /** bundle: {campaign?: data, campaignId?, entities:[{key,type,data}]} con riferimenti espressi come `key`. */
  importBundle({ campaignId, campaign, entities }, { source = "generatore" } = {}) {
    return tx(this.db, () => {
      const cid = campaignId ?? this.createCampaign(campaign, { source }).id;
      const idMap = new Map();
      const typeMap = new Map();
      for (const e of entities) { idMap.set(e.key, newId(e.type.slice(0, 3))); typeMap.set(idMap.get(e.key), e.type); }
      const existing = this.#resolver(cid, typeMap);
      const remap = (k) => idMap.get(k) ?? k;
      const created = [];
      // Tutto validato prima di inserire: eventuali errori annullano l'intera transazione.
      const prepared = entities.map((e) => {
        const def = ENTITY_TYPES[e.type];
        if (!def) throw new AppError(`Tipo sconosciuto nel bundle: ${e.type}`);
        const mapped = mapRefs(def.fields, e.data, remap);
        return { id: idMap.get(e.key), type: e.type, def, data: validateEntity(e.type, mapped, existing) };
      });
      const t = now();
      for (const p of prepared) {
        this.db.prepare("INSERT INTO entities(id,campaign_id,type,name,data,version,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?)").run(p.id, cid, p.type, p.data.name, JSON.stringify(p.data), t, t);
        created.push(p.id);
      }
      for (const p of prepared) {
        this.#writeRelations(cid, p.id, p.type, p.data);
        this.#revision(cid, p.id, p.type, 1, p.data.name, p.data, source);
      }
      this.#touch(cid);
      return { campaignId: cid, ids: Object.fromEntries(idMap), created };
    });
  }

  // ---------- esportazione / importazione / backup ----------
  exportPayload(campaignId) {
    const campaign = this.getCampaign(campaignId);
    // Il checksum copre solo i dati stabili (non versioni/timestamp, che cambiano a ogni ripristino).
    const { counts, createdAt, updatedAt, version, ...c } = campaign;
    const entities = this.db.prepare("SELECT * FROM entities WHERE campaign_id=? ORDER BY type, id").all(campaignId).map((r) => ({
      id: r.id, type: r.type, deleted: !!r.deleted_at, data: parse(r.data),
    }));
    // Il tracker viaggia con la campagna se è mai stato usato (anche vuoto: al ripristino lo svuota); la revisione è locale al database.
    // Un file senza tracker (versioni precedenti, tracker mai usato) al ripristino lascia invariato quello attuale.
    const t = this.getSetting(`tracker:${campaignId}`);
    const body = { campaign: c, entities, ...(t ? { tracker: { round: t.round, turn: t.turn, combatants: t.combatants } } : {}) };
    return {
      format: "dnd-campaign-studio/campaign", formatVersion: 1, schemaVersion: SCHEMA_VERSION,
      exportedAt: now(), checksum: payloadDigest(body), ...body,
    };
  }
  /**
   * mode "new": nuovi id (nessuna collisione); mode "restore": mantiene gli id, sostituisce la campagna esistente
   * (dopo backup automatico). Verifica formato, checksum e ogni entità prima di scrivere.
   */
  importPayload(payload, { mode = "new", title } = {}) {
    if (!payload || payload.format !== "dnd-campaign-studio/campaign") throw new AppError("File non riconosciuto: formato diverso da dnd-campaign-studio/campaign.");
    if (payload.formatVersion !== 1) throw new AppError(`Versione formato ${payload.formatVersion} non supportata.`);
    if (payload.schemaVersion > SCHEMA_VERSION) throw new AppError("Il file proviene da una versione più recente dell'app.");
    if (payloadDigest(payload) !== payload.checksum) throw new AppError("Checksum non valido: il file è corrotto o è stato modificato a mano.", 422);
    if (!Array.isArray(payload.entities) || !payload.campaign || typeof payload.campaign !== "object") throw new AppError("File non valido: campagna o elementi mancanti.", 422);
    let tracker = null;
    if (payload.tracker !== undefined) {
      try { tracker = normalizeTracker({ ...payload.tracker, rev: 0 }); }
      catch (err) { if (err instanceof ValidationError) throw new ValidationError(err.errors.map((x) => ({ ...x, path: `tracker: ${x.path}` }))); throw err; }
    }
    const { id: oldCid, archived, createdAt, updatedAt, version, ...cdata0 } = payload.campaign;
    const cdata = title ? { ...cdata0, title } : cdata0;
    const typeById = new Map(payload.entities.map((e) => [e.id, e.type]));
    const prepared = payload.entities.map((e) => {
      const def = ENTITY_TYPES[e.type];
      if (!def) throw new AppError(`Tipo sconosciuto nel file: ${e.type}`, 422);
      // Le entità eliminate (cestino) possono puntare a riferimenti validi nel payload; si validano tutte.
      // Il checksum rileva solo la corruzione accidentale (chiunque può ricalcolarlo): la validazione completa è la vera difesa.
      let data;
      try { data = validateEntity(e.type, e.data, (rid) => typeById.get(rid) ?? null); }
      catch (err) {
        if (err instanceof ValidationError) throw new ValidationError(err.errors.map((x) => ({ ...x, path: `${e.type} "${e.data?.name ?? e.id}": ${x.path}` })));
        throw err;
      }
      return { ...e, data };
    });
    return tx(this.db, () => {
      let cid = oldCid;
      let idMap = null;
      const t = now();
      let stamp = t, prevTrackerRev = -1;
      if (mode === "restore") {
        if (this.db.prepare("SELECT 1 FROM campaigns WHERE id=?").get(cid)) {
          this.createBackup(cid, "pre-ripristino");
          stamp = this.#nextStamp(cid); // successivo a quello attuale: le schede aperte vedono il cambiamento
          prevTrackerRev = this.getSetting(`tracker:${cid}`)?.rev ?? -1;
          this.db.prepare("DELETE FROM campaigns WHERE id=?").run(cid);
        }
      } else {
        cid = newId("camp");
        idMap = new Map(prepared.map((e) => [e.id, newId(e.type.slice(0, 3))]));
      }
      const clean = validateAgainst(CAMPAIGN_FIELDS, cdata, () => null);
      this.db.prepare("INSERT INTO campaigns(id,title,data,archived,created_at,updated_at,version) VALUES (?,?,?,?,?,?,1)")
        .run(cid, clean.title, JSON.stringify(clean), mode === "restore" && archived ? 1 : 0, mode === "restore" ? createdAt ?? t : t, stamp);
      // Tracker: quello del file sostituisce l'attuale; la revisione avanza, così una scheda aperta riceve 409 e ricarica.
      if (tracker) this.setSetting(`tracker:${cid}`, { ...tracker, rev: prevTrackerRev + 1 });
      this.#revision(cid, cid, "campaign", 1, clean.title, clean, mode === "restore" ? "ripristino" : "importazione");
      const map = (rid) => idMap?.get(rid) ?? rid;
      const items = prepared.map((e) => ({ ...e, id: map(e.id), data: mapRefs(ENTITY_TYPES[e.type].fields, e.data, map) }));
      for (const e of items)
        this.db.prepare("INSERT INTO entities(id,campaign_id,type,name,data,version,deleted_at,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?,?)")
          .run(e.id, cid, e.type, e.data.name, JSON.stringify(e.data), e.deleted ? t : null, t, t);
      for (const e of items) {
        this.#writeRelations(cid, e.id, e.type, e.data);
        this.#revision(cid, e.id, e.type, 1, e.data.name, e.data, mode === "restore" ? "ripristino" : "importazione");
      }
      return this.getCampaign(cid);
    });
  }
  createBackup(campaignId, label = "manuale") {
    if (!this.backupDir) throw new AppError("Cartella di backup non configurata", 500);
    fs.mkdirSync(this.backupDir, { recursive: true });
    const payload = this.exportPayload(campaignId);
    const safe = payload.campaign.title.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 40) || "campagna";
    const file = `${new Date().toISOString().replace(/[:.]/g, "-")}__${safe}__${label}__${campaignId}.json`;
    const full = path.join(this.backupDir, file);
    fs.writeFileSync(full, JSON.stringify(payload, null, 2), "utf8");
    // Verifica di rilettura: il backup deve essere integro prima di dichiararlo riuscito.
    const back = JSON.parse(fs.readFileSync(full, "utf8"));
    if (payloadDigest(back) !== payload.checksum)
      throw new AppError("Verifica del backup fallita (checksum diverso dopo la scrittura).", 500);
    return { file, bytes: fs.statSync(full).size, campaignId, entities: payload.entities.length };
  }
  listBackups() {
    if (!this.backupDir || !fs.existsSync(this.backupDir)) return [];
    return fs.readdirSync(this.backupDir).filter((f) => f.endsWith(".json")).sort().reverse().map((f) => {
      const st = fs.statSync(path.join(this.backupDir, f));
      return { file: f, bytes: st.size, at: st.mtime.toISOString() };
    });
  }
  restoreBackup(file) {
    if (!BACKUP_NAME.test(file) || file.includes("..") || path.basename(file) !== file) throw new AppError("Nome file di backup non valido");
    const full = path.join(this.backupDir, file);
    if (!fs.existsSync(full)) throw new AppError("Backup non trovato", 404);
    let payload;
    try { payload = JSON.parse(fs.readFileSync(full, "utf8")); } catch (e) { throw new AppError("Backup illeggibile: " + e.message, 422); }
    return this.importPayload(payload, { mode: "restore" });
  }
}
