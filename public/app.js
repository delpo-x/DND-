import { h, api, ApiError, toast, fail, modal, confirmDialog, typeToConfirm, fmtDate, control, buildForm, searchableText, mergeForConflict, previewValue } from "/lib.js";

const S = { schema: null, status: null, campaign: null, entities: [], deleted: 0 };
const $main = document.getElementById("main");
// Navigazioni sovrapposte: ogni vista ricorda il numero della propria navigazione (const mine = routeSeq) e con showView scrive
// nell'area principale solo se è ancora la più recente; così una vista lenta non copre quella aperta dopo.
let routeSeq = 0;
const showView = (seq, ...nodes) => { if (seq === routeSeq) $main.replaceChildren(...nodes); };
const $side = document.getElementById("sidebar");

const SECTIONS = [
  ["panoramica", "Panoramica"], ["tavolo", "Al tavolo"], ["sep", "Contenuti"],
  ["location", "Mondo e luoghi"], ["quest", "Missioni"], ["npc", "PNG"], ["faction", "Fazioni"], ["clue", "Indizi"], ["mystery", "Misteri"],
  ["item", "Oggetti"], ["event", "Eventi e cronologia"], ["session", "Sessioni"], ["dungeon", "Dungeon"],
  ["sep", "Analisi"], ["relazioni", "Relazioni"], ["coerenza", "Coerenza narrativa"], ["storico", "Cronologia modifiche"],
  ["sep", "Strumenti"], ["regole", "Regole e incontri"], ["tracker", "Tracker di combattimento"], ["esporta", "Esporta, stampa, backup"], ["cestino", "Cestino"],
];

// ---------------- avvio e routing ----------------
async function boot() {
  try {
    S.schema = await api("GET", "/api/schema");
    await refreshStatus();
  } catch (e) { $main.replaceChildren(h("p", { class: "pill-bad" }, e.message)); return; }
  document.getElementById("ai-badge").addEventListener("click", () => (location.hash = "#/impostazioni"));
  window.addEventListener("hashchange", guardedRoute);
  window.addEventListener("beforeunload", (ev) => { if (leaveGuard?.()) { ev.preventDefault(); ev.returnValue = ""; } });
  route();
}

// Protezione delle modifiche non salvate: ogni vista con un modulo imposta leaveGuard = () => ci sono modifiche.
let leaveGuard = null;
let lastHash = location.hash;
async function guardedRoute() {
  if (leaveGuard?.()) {
    const target = location.hash;
    history.replaceState(null, "", lastHash || "#/"); // resta sulla pagina finché l'utente non decide
    if (!(await confirmDialog("Modifiche non salvate", "Uscendo da questa pagina le modifiche non salvate andranno perse. Continuare?", "Esci senza salvare", true))) return;
    leaveGuard = null;
    location.hash = target;
    return;
  }
  route();
}

async function refreshStatus() {
  S.status = await api("GET", "/api/status");
  const b = document.getElementById("ai-badge");
  const a = S.status.ai;
  if (S.status.aiSettings.provider === "deterministic") { b.className = "badge off"; b.textContent = "IA locale: disattivata · modalità deterministica"; }
  else if (a.available) { b.className = "badge ok"; b.textContent = `IA locale: pronta (${a.model})`; }
  else { b.className = "badge bad"; b.textContent = "IA locale: non disponibile — si usa la modalità deterministica"; }
  b.title = a.message;
}

// Gli elementi si riscaricano solo se la campagna è cambiata: updatedAt cresce a ogni modifica (anche da un'altra scheda).
// La campagna si legge prima degli elementi, quindi gli elementi sono sempre almeno aggiornati quanto il segno salvato.
async function loadCampaign(id) {
  if (S.campaign?.id !== id) { S.campaign = null; S.loadedStamp = null; }
  const c = await api("GET", `/api/campaigns/${id}`);
  if (S.loadedStamp === `${id}|${c.updatedAt}`) { S.campaign = c; return; }
  const [ents, trash] = await Promise.all([api("GET", `/api/campaigns/${id}/entities`), api("GET", `/api/campaigns/${id}/entities?deleted=1`)]);
  S.campaign = c; S.entities = ents; S.deleted = trash.length; S.loadedStamp = `${id}|${c.updatedAt}`;
}
// ---------------- conflitti di versione: la bozza non si perde ----------------
/** Mostra cosa è cambiato altrove e cosa nella bozza; i campi modificati da entrambi si scelgono. null = annullato (bozza intatta). */
async function resolveConflict({ fields, base, mine, load }) {
  const cur = await load();
  const { merged, conflicts, takenTheirs, keptMine } = mergeForConflict(fields, base, mine, cur.data);
  const nameOf = (id) => S.entities.find((e) => e.id === id)?.data.name ?? id;
  const choice = new Map(conflicts.map((c) => [c.f.k, "mine"]));
  const rows = conflicts.map((c) => {
    const opt = (which, label, v) => h("label", { class: "conflict-opt" }, h("input", { type: "radio", name: `cf-${c.f.k}`, value: which, checked: which === "mine", onchange: () => choice.set(c.f.k, which) }), " ", h("strong", {}, label), h("div", { class: "muted" }, previewValue(c.f, v, nameOf)));
    return h("div", { class: "subform", "data-conflict": c.f.k }, h("div", { class: "lbl" }, c.f.label), opt("mine", "La mia bozza", c.mine), opt("theirs", "Versione salvata altrove", c.theirs));
  });
  const body = h("div", {},
    h("p", {}, "È stato salvato da un'altra scheda mentre lo modificavi. La tua bozza non è persa."),
    keptMine.length ? h("p", {}, h("strong", {}, "Tue modifiche mantenute: "), keptMine.join(", ")) : null,
    takenTheirs.length ? h("p", {}, h("strong", {}, "Prese dalla versione salvata altrove (non le avevi toccate): "), takenTheirs.join(", ")) : null,
    conflicts.length ? [h("p", {}, h("strong", {}, `Modificati da entrambi (${conflicts.length}): scegli quale versione tenere.`)), rows]
      : h("p", {}, "Nessun campo modificato da entrambi: le modifiche si uniscono senza perdite."));
  const r = await modal("Modificato in un'altra scheda", body, [{ label: "Annulla (tieni la bozza)", value: null, cls: "secondary" }, { label: "Salva unendo", value: "ok" }]);
  if (r !== "ok") return null;
  for (const c of conflicts) if (choice.get(c.f.k) === "theirs") merged[c.f.k] = c.theirs;
  return { base: cur.data, data: merged, version: cur.version };
}
/** Salva; se un'altra scheda ha salvato nel frattempo (409) propone l'unione e riprova con la versione aggiornata. */
async function saveMerging({ fields, base, data, put, load }) {
  let version;
  for (let attempt = 0; attempt < 5; attempt++) {
    try { return { out: await put(data, version), merged: attempt > 0 }; }
    catch (er) {
      if (er.status !== 409) throw er;
      const r = await resolveConflict({ fields, base, mine: data, load });
      if (!r) return null;
      ({ base, data, version } = r);
    }
  }
  throw new Error("Salvataggio non riuscito: la versione continua a cambiare in un'altra scheda.");
}

const ctx = (selfId) => ({ entities: S.entities, selfId, schema: S.schema });
const byId = (id) => S.entities.find((e) => e.id === id);
const nameOf = (id) => byId(id)?.data.name ?? "—";
const TL = (t) => S.schema.entityTypes[t].label;

async function route() {
  leaveGuard = null; lastHash = location.hash;
  const seq = ++routeSeq;
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  try {
    if (!parts.length) return await viewDashboard();
    if (parts[0] === "impostazioni") return await viewSettings();
    if (parts[0] === "c" && parts[1]) {
      if (S.campaign?.id !== parts[1] || !parts[3]) await loadCampaign(parts[1]);
      if (seq !== routeSeq) return; // nel frattempo è partita un'altra navigazione
      renderSidebar(parts[2] ?? "panoramica");
      const sec = parts[2] ?? "panoramica", eid = parts[3];
      if (S.schema.entityTypes[sec]) return eid ? (sec === "dungeon" ? await viewDungeon(eid) : await viewEditor(eid)) : await viewList(sec);
      if (sec === "tavolo") return await viewTable(eid);
      const v = { panoramica: viewOverview, relazioni: viewGraph, coerenza: viewCheck, storico: viewHistory, regole: viewRules, tracker: viewTracker, esporta: viewExport, cestino: viewTrash }[sec];
      if (!v) throw new Error("Sezione sconosciuta");
      return await v();
    }
    throw new Error("Pagina non trovata");
  } catch (e) {
    if (seq !== routeSeq) return;
    if (e instanceof ApiError && e.status === 404 && parts[0] === "c") { toast("Elemento non trovato (forse eliminato).", "err"); location.hash = "#/"; return; }
    showView(seq, h("p", { class: "pill-bad" }, e.message));
  }
}

function renderSidebar(active) {
  const c = S.campaign;
  $side.hidden = false;
  document.getElementById("campaign-title").textContent = c.title + (c.archived ? " (archiviata)" : "");
  const counts = c.counts ?? {};
  const n = (t) => S.entities.filter((e) => e.type === t).length;
  $side.replaceChildren(...SECTIONS.map(([key, label]) =>
    key === "sep" ? h("div", { class: "sep" }, label)
      : h("a", { href: `#/c/${c.id}/${key}`, class: key === active ? "active" : "" }, label,
        S.schema.entityTypes[key] ? h("span", { class: "count" }, n(key)) : key === "cestino" && S.deleted ? h("span", { class: "count" }, S.deleted) : null)));
  void counts;
}
// Navigazione decisa dall'app (dopo salvataggi, eliminazioni…): non chiede conferma.
function goto(section, id) { leaveGuard = null; location.hash = `#/c/${S.campaign.id}/${section}${id ? "/" + id : ""}`; }

// ---------------- dashboard ----------------
async function viewDashboard() {
  const mine = routeSeq;
  S.campaign = null; $side.hidden = true; document.getElementById("campaign-title").textContent = "";
  const list = await api("GET", "/api/campaigns");
  const fileIn = h("input", { type: "file", accept: ".json,application/json", hidden: true, onchange: async () => {
    const f = fileIn.files[0]; if (!f) return;
    try { const payload = JSON.parse(await f.text()); const c = await api("POST", "/api/import", { payload }); toast(`Campagna "${c.title}" importata.`, "ok"); await viewDashboard(); }
    catch (e) { fail(e); } fileIn.value = "";
  } });
  const cards = list.map((c) => h("div", { class: `card ${c.archived ? "archived" : ""}` },
    h("h3", {}, c.title, c.archived ? h("span", { class: "tag" }, "archiviata") : null),
    h("div", { class: "muted" }, `${c.tone} · pericolo ${c.danger} · ${c.players} giocatori · livelli ${c.startLevel}→${c.endLevel}`),
    h("p", {}, (c.premise || c.setting || "").slice(0, 160)),
    h("div", {}, ["npc", "quest", "location", "faction"].map((t) => h("span", { class: "tag" }, `${c.counts[t] ?? 0} ${S.schema.entityTypes[t].plural}`))),
    h("div", { class: "muted" }, `Modificata: ${fmtDate(c.updatedAt)}`),
    h("div", { class: "row", style: "margin-top:.7rem" },
      h("a", { class: "btn", href: `#/c/${c.id}/panoramica` }, "Apri"),
      h("button", { class: "secondary small", onclick: async () => { try { await api("POST", `/api/campaigns/${c.id}/duplicate`); toast("Campagna duplicata.", "ok"); viewDashboard(); } catch (e) { fail(e); } } }, "Duplica"),
      h("button", { class: "secondary small", onclick: async () => { try { await api("POST", `/api/campaigns/${c.id}/archive`, { archived: !c.archived }); viewDashboard(); } catch (e) { fail(e); } } }, c.archived ? "Ripristina" : "Archivia"),
      h("button", { class: "danger small", onclick: () => deleteCampaign(c) }, "Elimina"))));
  showView(mine, 
    h("h1", {}, "Le tue campagne"),
    h("div", { class: "toolbar" }, h("button", { onclick: () => newCampaignDialog() }, "＋ Nuova campagna"), h("button", { class: "secondary", onclick: () => fileIn.click() }, "Importa da file JSON…"), fileIn),
    list.length ? h("div", { class: "grid" }, cards) : h("p", { class: "muted" }, "Nessuna campagna ancora: creane una (anche generata automaticamente, senza IA né rete) oppure importa un file."),
    h("p", { class: "muted" }, `Dati salvati in locale (SQLite). Versione ${S.status.version} · regole ${S.status.rulesVersion}.`));
}

async function deleteCampaign(c) {
  const t = await typeToConfirm("Eliminare la campagna?", `"${c.title}" e tutti i suoi contenuti verranno eliminati definitivamente. Prima dell'eliminazione viene creato un backup ripristinabile.`, c.title);
  if (!t) return;
  try { const r = await api("DELETE", `/api/campaigns/${c.id}`, { confirmTitle: t }); toast(`Eliminata. Backup: ${r.backup}`, "ok", 9000); viewDashboard(); } catch (e) { fail(e); }
}

async function newCampaignDialog() {
  const f = S.schema.campaignFields;
  const form = buildForm(f.filter((x) => ["title", "setting", "tone", "danger", "players", "startLevel", "endLevel", "sessions", "seed"].includes(x.k)), { tone: "eroico", danger: "medio", players: 4, startLevel: 1, endLevel: 5, sessions: 8 }, ctx());
  const mode = h("select", {}, h("option", { value: "generate" }, "Genera una campagna completa (deterministico, offline)"), h("option", { value: "blank" }, "Campagna vuota"));
  const structs = Object.entries(S.schema.structures ?? {});
  const structure = h("select", { "data-structure": "1" }, structs.map(([k, s]) => h("option", { value: k }, s.label)));
  const structHelp = h("p", { class: "muted" });
  const showHelp = () => { structHelp.textContent = S.schema.structures?.[structure.value]?.description ?? ""; };
  structure.addEventListener("change", showHelp); showHelp();
  const structField = h("div", { class: "field" }, h("label", { class: "lbl" }, "Struttura narrativa"), structure, structHelp);
  mode.addEventListener("change", () => (structField.hidden = mode.value !== "generate"));
  const body = h("div", {}, h("div", { class: "field" }, h("label", { class: "lbl" }, "Modalità"), mode), structField, h("div", { style: "height:.6rem" }), form.el,
    h("p", { class: "muted" }, "Con la generazione, lo stesso seed (con la stessa struttura) produce sempre la stessa campagna. Lasciando vuoti titolo e seed vengono scelti automaticamente."));
  let dirty = false;
  form.el.addEventListener("input", () => (dirty = true)); form.el.addEventListener("change", () => (dirty = true));
  const r = await modal("Nuova campagna", body, [{ label: "Annulla", value: null, cls: "secondary" }, { label: "Crea", value: "ok", onclick: async () => {
    try {
      const d = form.collect();
      if (mode.value === "generate") {
        const params = Object.fromEntries(Object.entries(d).filter(([, v]) => v !== "" && v !== null));
        params.structure = structure.value;
        const out = await api("POST", "/api/campaigns", { generate: true, params });
        toast(`Campagna generata (tema: ${out.theme}). Controllo coerenza: ${out.report.summary.errore} errori, ${out.report.summary.rischio} rischi.`, "ok", 8000);
        location.hash = `#/c/${out.campaign.id}/panoramica`;
      } else {
        if (!d.title) { toast("Il titolo è obbligatorio.", "err"); return false; }
        const c = await api("POST", "/api/campaigns", { data: d });
        location.hash = `#/c/${c.id}/panoramica`;
      }
    } catch (e) { if (e.body?.validation) { form.showErrors(e.body.validation); toast(e.message, "err"); } else fail(e); return false; }
  } }], { guard: () => dirty });
  void r;
}

// ---------------- panoramica ----------------
async function viewOverview() {
  const mine = routeSeq;
  const c = S.campaign;
  const form = buildForm(S.schema.campaignFields, c, ctx());
  let dirty = false;
  form.el.addEventListener("input", () => (dirty = true));
  form.el.addEventListener("change", () => (dirty = true));
  if (mine === routeSeq) leaveGuard = () => dirty;
  const rep = await api("GET", `/api/campaigns/${c.id}/check`);
  const nextEvents = S.entities.filter((e) => e.type === "event" && !e.data.happened && e.data.day >= c.currentDay).sort((a, b) => a.data.day - b.data.day).slice(0, 5);
  const quests = S.entities.filter((e) => e.type === "quest");
  showView(mine, 
    h("h1", {}, c.title),
    h("div", { class: "summary" },
      [["errore", "Errori certi"], ["rischio", "Rischi narrativi"], ["suggerimento", "Suggerimenti"]].map(([k, l]) => h("a", { href: `#/c/${c.id}/coerenza`, class: "box", style: "text-decoration:none;color:inherit" }, h("div", { class: "num " + (k === "errore" && rep.summary[k] ? "pill-bad" : "") }, rep.summary[k]), l)),
      h("div", { class: "box" }, h("div", { class: "num" }, `${quests.filter((q) => q.data.status === "completata").length}/${quests.length}`), "Missioni completate")),
    nextEvents.length ? h("div", {}, h("h3", {}, "Prossimi eventi"), h("ul", {}, nextEvents.map((e) => h("li", {}, h("a", { href: `#/c/${c.id}/event/${e.id}` }, e.data.name), ` — giorno ${e.data.day}`)))) : null,
    h("h2", {}, "Dati della campagna"), form.el,
    h("div", { class: "toolbar" }, h("button", { onclick: async () => {
      try {
        const r = await saveMerging({ fields: S.schema.campaignFields, base: c, data: form.collect(),
          put: (data, v) => api("PUT", `/api/campaigns/${c.id}`, { ...data, expectedVersion: v ?? S.campaign.version }),
          load: async () => { const x = await api("GET", `/api/campaigns/${c.id}`); return { data: x, version: x.version }; } });
        if (!r) return;
        S.campaign = r.out; dirty = false; toast(r.merged ? "Campagna salvata unendo le modifiche." : "Campagna salvata.", "ok"); renderSidebar("panoramica"); form.showErrors([]);
        if (r.merged) viewOverview();
      }
      catch (e) { if (e.body?.validation) { const g = form.showErrors(e.body.validation); toast(e.message, "err"); void g; } else fail(e); }
    } }, "Salva modifiche")));
}

// ---------------- liste ----------------
const SUMMARY = {
  location: (d) => [d.kind, d.access, d.parent ? "in " + nameOf(d.parent) : ""],
  npc: (d) => [d.role, d.status, d.location ? nameOf(d.location) : "senza luogo"],
  quest: (d) => [d.kind, d.act ? "atto " + d.act : "", d.status],
  faction: (d) => [d.stance, "rep. " + d.standing, d.leader ? "capo: " + nameOf(d.leader) : ""],
  clue: (d) => [d.truthful ? "veritiero" : "falsa pista", d.foundAtLocation ? nameOf(d.foundAtLocation) : d.foundWithNpc ? nameOf(d.foundWithNpc) : "senza fonte"],
  mystery: (d) => [`${(d.clues ?? []).length} indizi`, `${(d.redHerrings ?? []).length} false piste`],
  item: (d) => [d.kind, d.origin ? "da " + nameOf(d.origin) : "origine ignota"],
  event: (d) => [`giorno ${d.day}`, d.kind, d.happened ? "accaduto" : "da accadere"],
  session: (d) => [`n. ${d.number}`, d.act ? "atto " + d.act : "", d.played ? "giocata" : "da giocare"],
  dungeon: (d) => [`${(d.rooms ?? []).length} stanze`, "seed " + d.seed, d.location ? nameOf(d.location) : ""],
};
const SORT = { event: (a, b) => a.data.day - b.data.day, session: (a, b) => a.data.number - b.data.number, quest: (a, b) => (a.data.act ?? 9) - (b.data.act ?? 9) || (a.data.chapter ?? 9) - (b.data.chapter ?? 9) };

async function viewList(type) {
  const mine = routeSeq;
  const def = S.schema.entityTypes[type];
  const q = h("input", { type: "search", placeholder: `Cerca in ${def.plural.toLowerCase()}…` });
  const enumFields = def.fields.filter((f) => f.t === "enum" && f.k !== "kind" || f.k === "kind" && f.t === "enum").slice(0, 2);
  const filters = enumFields.map((f) => h("select", { "data-k": f.k }, h("option", { value: "" }, `${f.label}: tutti`), f.opts.map((o) => h("option", { value: o }, o))));
  const tbody = h("tbody");
  function draw() {
    const needle = q.value.trim().toLocaleLowerCase("it");
    let rows = S.entities.filter((e) => e.type === type);
    if (needle) rows = rows.filter((e) => searchableText(def.fields, e.data).includes(needle));
    for (const f of filters) if (f.value) rows = rows.filter((e) => e.data[f.dataset.k] === f.value);
    rows.sort(SORT[type] ?? ((a, b) => a.data.name.localeCompare(b.data.name)));
    tbody.replaceChildren(...rows.map((e) => h("tr", { class: "clickable", onclick: () => goto(type, e.id) }, h("td", {}, h("strong", {}, e.data.name)), h("td", {}, (SUMMARY[type]?.(e.data) ?? []).filter(Boolean).map((s) => h("span", { class: "tag" }, s))))));
    if (!rows.length) tbody.replaceChildren(h("tr", {}, h("td", { colspan: 2, class: "muted" }, "Nessun elemento corrisponde ai filtri.")));
    count.textContent = `${rows.length} elementi`;
  }
  const count = h("span", { class: "muted" });
  q.addEventListener("input", draw); filters.forEach((f) => f.addEventListener("change", draw));
  const gen = ["npc", "event", "location", "dungeon"].includes(type);
  showView(mine, 
    h("h1", {}, def.plural),
    h("div", { class: "toolbar" }, q, filters, count,
      h("button", { onclick: () => createEntityDialog(type) }, `＋ Aggiungi ${def.label.toLowerCase()}`),
      gen ? h("button", { class: "secondary", onclick: () => generateDialog(type) }, "✦ Genera (deterministico)") : null),
    h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "Nome"), h("th", {}, "Dettagli"))), tbody));
  draw();
}

async function createEntityDialog(type) {
  const def = S.schema.entityTypes[type];
  if (type === "dungeon") return generateDialog(type);
  const defaults = Object.fromEntries(def.fields.filter((f) => f.def !== undefined).map((f) => [f.k, f.def]));
  if (type === "event") defaults.day = S.campaign.currentDay;
  if (type === "session") defaults.number = S.entities.filter((e) => e.type === "session").length + 1;
  const form = buildForm(def.fields, defaults, ctx());
  let dirty = false;
  form.el.addEventListener("input", () => (dirty = true)); form.el.addEventListener("change", () => (dirty = true));
  await modal(`Aggiungi ${def.label.toLowerCase()}`, form.el, [{ label: "Annulla", value: null, cls: "secondary" }, { label: "Crea", value: "ok", onclick: async () => {
    try {
      const e = await api("POST", `/api/campaigns/${S.campaign.id}/entities`, { type, data: form.collect() });
      await loadCampaign(S.campaign.id); toast("Creato.", "ok"); goto(type, e.id);
    } catch (e) { if (e.body?.validation) { form.showErrors(e.body.validation); toast(e.message, "err"); } else fail(e); return false; }
  } }], { guard: () => dirty });
}

async function generateDialog(type) {
  const seed = h("input", { type: "text", placeholder: "vuoto = casuale" });
  const loc = h("select", {}, h("option", { value: "" }, "— nessuno —"), S.entities.filter((e) => e.type === "location").map((e) => h("option", { value: e.id }, e.data.name)));
  const extra = {};
  const parts = [h("div", { class: "field" }, h("label", { class: "lbl" }, "Seed (stesso seed = stesso risultato)"), seed)];
  if (type !== "location") parts.push(h("div", { class: "field" }, h("label", { class: "lbl" }, type === "dungeon" ? "Collega al luogo" : "Luogo"), loc));
  else parts.push(h("div", { class: "field" }, h("label", { class: "lbl" }, "Contenuto in"), loc));
  if (type === "dungeon") {
    extra.name = h("input", { type: "text", placeholder: "Nome del dungeon" }); extra.rooms = h("input", { type: "number", value: 8, min: 3, max: 20 });
    extra.width = h("input", { type: "number", value: 48, min: 20, max: 80 }); extra.height = h("input", { type: "number", value: 32, min: 20, max: 60 });
    extra.level = h("input", { type: "number", value: Math.max(1, S.campaign.startLevel), min: 1, max: 20 });
    for (const [k, l] of [["name", "Nome"], ["rooms", "Numero di stanze"], ["width", "Larghezza"], ["height", "Altezza"], ["level", "Livello del gruppo"]]) parts.push(h("div", { class: "field" }, h("label", { class: "lbl" }, l), extra[k]));
  }
  const genForm = h("div", { class: "form" }, parts);
  let dirty = false;
  genForm.addEventListener("input", () => (dirty = true)); genForm.addEventListener("change", () => (dirty = true));
  await modal(`Genera ${TL(type).toLowerCase()}`, genForm, [{ label: "Annulla", value: null, cls: "secondary" }, { label: "Genera", value: "ok", onclick: async () => {
    try {
      const body = { kind: type, seed: seed.value || undefined, locationId: loc.value || null, parentId: loc.value || null };
      for (const [k, el] of Object.entries(extra)) body[k] = el.type === "number" ? Number(el.value) : el.value;
      const r = await api("POST", `/api/campaigns/${S.campaign.id}/generate`, body);
      await loadCampaign(S.campaign.id); toast(`Generato (seed ${r.seed}).`, "ok"); goto(type, r.entity.id);
    } catch (e) { fail(e); return false; }
  } }], { guard: () => dirty });
}

// ---------------- editor entità ----------------
const TEXTUAL = new Set(["string", "text", "strings"]);
async function viewEditor(id) {
  const mine = routeSeq;
  const e = await api("GET", `/api/entities/${id}`);
  const def = S.schema.entityTypes[e.type];
  let dirty = false;
  const regenBtn = (f) => {
    if (!TEXTUAL.has(f.t) || f.k === "name") return null;
    const useAi0 = S.status.aiSettings.provider === "ollama";
    if (!useAi0 && !S.schema.regenerableDeterministic.includes(`${e.type}.${f.k}`)) return null;
    return h("button", { type: "button", class: "secondary small regen", title: "Rigenera solo questo campo (il resto resta invariato)", onclick: async () => {
      if (dirty && !(await confirmDialog("Modifiche non salvate", "Rigenerando il campo, le modifiche non salvate nel modulo andranno perse. Continuare?"))) return;
      const useAi = S.status.aiSettings.provider === "ollama";
      try {
        const r = await api("POST", `/api/entities/${id}/regenerate`, { field: f.k, provider: useAi ? "ollama" : "deterministic" });
        toast(`Campo "${f.label}" rigenerato (${r.provider === "ollama" ? "IA locale" : "deterministico"}).`, "ok"); await loadCampaign(S.campaign.id); viewEditor(id);
      } catch (er) { fail(er); }
    } }, "↻ rigenera");
  };
  const form = buildForm(def.fields, e.data, ctx(id), { extra: regenBtn });
  form.el.addEventListener("input", () => (dirty = true));
  form.el.addEventListener("change", () => (dirty = true));
  if (mine === routeSeq) leaveGuard = () => dirty;
  const general = h("div", { class: "pill-bad" });
  const inbound = await api("GET", `/api/entities/${id}/inbound`);
  const revs = await api("GET", `/api/entities/${id}/revisions`);
  // Ultima modifica = rigenerazione di un campo: si può annullare in un clic (torna alla versione precedente).
  const lastRegen = revs[0] && revs[0].version === e.version && revs[0].version > 1 && ["ia:ollama", "deterministico"].includes(revs[0].source) && /^rigenerato "/.test(revs[0].note ?? "") ? revs[0] : null;
  const undoBtn = lastRegen ? h("button", { class: "secondary", "data-undo-regen": "1", title: `Torna alla versione ${lastRegen.version - 1}`, onclick: async () => {
    if (dirty && !(await confirmDialog("Modifiche non salvate", "Annullando la rigenerazione, le modifiche non salvate nel modulo andranno perse. Continuare?"))) return;
    try { await api("POST", `/api/entities/${id}/undo-regenerate`, { expectedVersion: e.version }); dirty = false; toast("Rigenerazione annullata.", "ok"); await loadCampaign(S.campaign.id); viewEditor(id); } catch (er) { fail(er); }
  } }, `↶ Annulla rigenerazione (${lastRegen.note.replace(/^rigenerato /, "")})`) : null;
  showView(mine,
    h("div", { class: "toolbar" }, h("a", { href: `#/c/${S.campaign.id}/${e.type}` }, `← ${def.plural}`), h("span", { class: "muted" }, `versione ${e.version} · aggiornato ${fmtDate(e.updatedAt)}`)),
    h("h1", {}, e.data.name), general, form.el,
    h("div", { class: "toolbar" },
      h("button", { onclick: async () => {
        try {
          const r = await saveMerging({ fields: def.fields, base: e.data, data: form.collect(),
            put: (data, v) => api("PUT", `/api/entities/${id}`, { data, expectedVersion: v ?? e.version }),
            load: async () => { const x = await api("GET", `/api/entities/${id}`); return { data: x.data, version: x.version }; } });
          if (!r) return; // conflitto annullato: la bozza resta nel modulo
          dirty = false; await loadCampaign(S.campaign.id); renderSidebar(e.type); toast(r.merged ? "Salvato unendo le modifiche." : "Salvato.", "ok"); viewEditor(id);
        } catch (er) {
          if (er.body?.validation) { const g = form.showErrors(er.body.validation); general.textContent = g.map((x) => x.path + ": " + x.message).join(" · "); toast("Dati non validi: controlla i campi evidenziati.", "err"); } else fail(er);
        }
      } }, "Salva"),
      undoBtn,
      e.type === "event" && !e.data.happened ? h("button", { class: "secondary", onclick: async () => {
        if (!(await confirmDialog("Applicare l'evento?", `Gli effetti dell'evento "${e.data.name}" verranno applicati a PNG, fazioni e luoghi (con cronologia delle modifiche).`, "Applica"))) return;
        try { const r = await api("POST", `/api/entities/${id}/apply`); toast(`Evento applicato (${r.applied.length} effetti).`, "ok"); await loadCampaign(S.campaign.id); viewEditor(id); } catch (er) { fail(er); }
      } }, "Applica effetti all'evento") : null,
      h("button", { class: "danger", onclick: async () => {
        if (inbound.length) { await modal("Impossibile eliminare", h("div", {}, h("p", {}, "Questo elemento è ancora usato da:"), h("ul", {}, inbound.map((r) => h("li", {}, h("a", { href: `#/c/${S.campaign.id}/${r.type}/${r.id}`, onclick: () => document.getElementById("modal-root").replaceChildren() }, r.name), ` (${TL(r.type)}, campo ${r.field})`))), h("p", {}, "Rimuovi prima questi collegamenti.")), [{ label: "Chiudi", value: true }]); return; }
        if (!(await confirmDialog("Spostare nel cestino?", `"${e.data.name}" verrà spostato nel cestino e potrà essere ripristinato.`, "Sposta nel cestino", true))) return;
        try { await api("DELETE", `/api/entities/${id}`); await loadCampaign(S.campaign.id); toast("Spostato nel cestino.", "ok"); goto(e.type); } catch (er) { fail(er); }
      } }, "Elimina")),
    inbound.length ? h("details", {}, h("summary", {}, `Usato da ${inbound.length} elementi`), h("ul", {}, inbound.map((r) => h("li", {}, h("a", { href: `#/c/${S.campaign.id}/${r.type}/${r.id}` }, r.name), ` (${TL(r.type)} · ${r.field})`)))) : null,
    h("details", {}, h("summary", {}, `Storico delle versioni (${revs.length})`), h("table", {}, h("tbody", {}, revs.map((r) => h("tr", {}, h("td", {}, "v" + r.version), h("td", {}, fmtDate(r.at)), h("td", {}, r.source + (r.note ? " — " + r.note : "")),
      h("td", {}, r.version === e.version ? h("span", { class: "muted" }, "corrente") : h("button", { class: "secondary small", onclick: async () => {
        if (!(await confirmDialog("Ripristinare la versione?", `I dati torneranno a quelli della versione ${r.version} (la versione attuale resta nello storico).`, "Ripristina"))) return;
        try { await api("POST", `/api/entities/${id}/revisions/${r.version}/restore`); toast("Versione ripristinata.", "ok"); await loadCampaign(S.campaign.id); viewEditor(id); } catch (er) { fail(er); }
      } }, "Ripristina"))))))));
}

// ---------------- dungeon ----------------
async function viewDungeon(id) {
  const mine = routeSeq;
  const e = await api("GET", `/api/entities/${id}`);
  const def = S.schema.entityTypes.dungeon;
  const d = { ...e.data, rooms: e.data.rooms ?? [] };
  // Dati di versioni precedenti senza griglia valida: si parte da una mappa vuota (il controllo di coerenza lo segnala).
  const grid = Array.isArray(d.grid) && d.grid.length === d.height ? d.grid.map((r) => r.padEnd(d.width, "#").slice(0, d.width).split("")) : Array.from({ length: d.height }, () => Array(d.width).fill("#"));
  const cell = 14;
  let tool = ".";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", d.width * cell); svg.setAttribute("height", d.height * cell);
  const COLORS = { "#": "#1d1a16", ".": "#d9cfb8", "+": "#8a5a2b", S: "#b04a3a" };
  let dirty = false;
  function draw() {
    svg.replaceChildren();
    grid.forEach((row, y) => row.forEach((c, x) => {
      const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      r.setAttribute("x", x * cell); r.setAttribute("y", y * cell); r.setAttribute("width", cell); r.setAttribute("height", cell);
      r.setAttribute("fill", COLORS[c]); r.setAttribute("stroke", "#3a3326"); r.setAttribute("stroke-width", ".4");
      r.addEventListener("mousedown", (ev) => { paint(x, y); ev.preventDefault(); });
      r.addEventListener("mouseenter", (ev) => { if (ev.buttons === 1) paint(x, y); });
      svg.append(r);
    }));
    d.rooms.forEach((r, i) => {
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", (r.x + r.w / 2) * cell); t.setAttribute("y", (r.y + r.h / 2) * cell + 5); t.setAttribute("text-anchor", "middle"); t.setAttribute("font-size", 13); t.setAttribute("font-weight", "bold"); t.setAttribute("fill", "#3a2f1f"); t.setAttribute("pointer-events", "none");
      t.textContent = String(i + 1); svg.append(t);
    });
  }
  function paint(x, y) { if (grid[y][x] !== tool) { grid[y][x] = tool; dirty = true; draw(); } }
  const toolSel = h("div", { class: "row legend" }, [["#", "Muro"], [".", "Pavimento"], ["+", "Porta"], ["S", "Porta segreta"]].map(([k, l]) => h("label", {}, h("input", { type: "radio", name: "tool", value: k, checked: k === ".", onchange: () => (tool = k) }), " ", l)));
  const form = buildForm(def.fields.filter((f) => f.t !== "grid"), d, ctx(id), { skip: ["width", "height"] });
  form.el.addEventListener("input", () => (dirty = true));
  form.el.addEventListener("change", () => (dirty = true));
  if (mine === routeSeq) leaveGuard = () => dirty;
  const encText = (enc) => (!enc ? "" : Array.isArray(enc.creatures) ? ` — incontro ${enc.totalXp ?? "?"}/${enc.budget ?? "?"} PE: ${enc.creatures.map((c) => c.count + "× " + c.name).join(", ")}` : " — incontro con dati non validi");
  const roomsInfo = d.rooms.map((r, i) => h("li", {}, `${i + 1}. ${r.name} [${r.kind}]`, encText(r.encounter)));
  showView(mine, 
    h("div", { class: "toolbar" }, h("a", { href: `#/c/${S.campaign.id}/dungeon` }, "← Dungeon"), h("span", { class: "muted" }, `versione ${e.version} · seed ${d.seed} · ${d.width}×${d.height}`)),
    h("h1", {}, d.name),
    h("p", { class: "muted" }, "Clic o trascinamento sulla mappa per modificarla con lo strumento scelto. Ricorda di salvare."),
    toolSel, h("div", { class: "map-wrap" }, svg),
    h("details", {}, h("summary", {}, "Stanze e incontri (generati da SRD 5.2)"), h("ul", {}, roomsInfo)),
    h("h2", {}, "Dettagli, stanze, note"), form.el,
    h("div", { class: "toolbar" },
      h("button", { onclick: async () => {
        try {
          const data = form.collect(); data.grid = grid.map((r) => r.join(""));
          const fields = [...def.fields.filter((f) => !["width", "height", "grid"].includes(f.k)), { k: "grid", label: "Mappa", t: "grid" }];
          const r = await saveMerging({ fields, base: e.data, data,
            put: (dt, v) => api("PUT", `/api/entities/${id}`, { data: dt, expectedVersion: v ?? e.version }),
            load: async () => { const x = await api("GET", `/api/entities/${id}`); return { data: x.data, version: x.version }; } });
          if (!r) return;
          dirty = false; await loadCampaign(S.campaign.id); toast(r.merged ? "Dungeon salvato unendo le modifiche." : "Dungeon salvato.", "ok"); viewDungeon(id);
        } catch (er) { if (er.body?.validation) { form.showErrors(er.body.validation); toast("Dati non validi.", "err"); } else fail(er); }
      } }, "Salva"),
      h("a", { class: "btn secondary", href: `/api/entities/${id}/export?format=svg` }, "Esporta mappa (SVG)"),
      h("a", { class: "btn secondary", href: `/api/entities/${id}/export?format=md` }, "Esporta note (Markdown)"),
      h("button", { class: "danger", onclick: async () => {
        if (!(await confirmDialog("Spostare nel cestino?", `"${d.name}" potrà essere ripristinato dal cestino.`, "Sposta nel cestino", true))) return;
        try { await api("DELETE", `/api/entities/${id}`); await loadCampaign(S.campaign.id); goto("dungeon"); } catch (er) { fail(er); }
      } }, "Elimina")));
  draw();
}

// ---------------- relazioni (grafo) ----------------
const TYPE_COLOR = { location: "#6aa8d8", npc: "#d8a24a", faction: "#c06ad8", quest: "#6fbf73", clue: "#e0675a", mystery: "#e0b04a", item: "#8fd8c8", event: "#d88a6a", session: "#999", dungeon: "#7a7ad8" };
async function viewGraph() {
  const mine = routeSeq;
  const g = await api("GET", `/api/campaigns/${S.campaign.id}/graph`);
  const active = new Set(Object.keys(TYPE_COLOR).filter((t) => t !== "session" && t !== "dungeon"));
  const wrap = h("div", { class: "graph-wrap" });
  const checks = h("div", { class: "row" }, Object.keys(TYPE_COLOR).map((t) => h("label", {}, h("input", { type: "checkbox", checked: active.has(t), onchange: (ev) => { ev.target.checked ? active.add(t) : active.delete(t); force = false; draw(); } }), " ", h("span", { style: `color:${TYPE_COLOR[t]}` }, "● "), TL(t))));
  // Con campagne grandi il grafo completo è illeggibile e la disposizione costa O(n²) per passo: oltre MAX_NODES si chiede di filtrare.
  const MAX_NODES = 400;
  let force = false, qTimer = null;
  const q = h("input", { type: "search", placeholder: "Filtra per nome: mostra gli elementi trovati e i loro collegamenti…", style: "min-width:340px", oninput: () => { clearTimeout(qTimer); qTimer = setTimeout(() => { force = false; draw(); }, 200); } });
  function draw() {
    let pool = g.nodes.filter((n) => active.has(n.type));
    const needle = q.value.trim().toLocaleLowerCase("it");
    if (needle) {
      const keep = new Set(pool.filter((n) => n.name.toLocaleLowerCase("it").includes(needle)).map((n) => n.id));
      for (const e of g.edges) { if (keep.has(e.source) && !keep.has(e.target)) keep.add("+" + e.target); if (keep.has(e.target) && !keep.has(e.source)) keep.add("+" + e.source); }
      pool = pool.filter((n) => keep.has(n.id) || keep.has("+" + n.id));
    }
    if (pool.length > MAX_NODES && !force) {
      wrap.replaceChildren(h("p", {}, `Troppi elementi da disegnare in modo leggibile (${pool.length}, il limite è ${MAX_NODES}). Filtra per nome o togli dei tipi qui sopra. `,
        h("button", { class: "secondary small", onclick: () => { force = true; draw(); } }, "Disegna comunque (lento)")));
      info.textContent = `${pool.length} elementi selezionati.`;
      return;
    }
    const nodes = pool.map((n) => ({ ...n }));
    const ids = new Map(nodes.map((n, i) => [n.id, i]));
    const edges = g.edges.filter((e) => ids.has(e.source) && ids.has(e.target)).map((e) => ({ s: ids.get(e.source), t: ids.get(e.target), field: e.field }));
    const W = 1100, H = 720;
    nodes.forEach((n, i) => { const a = (i / nodes.length) * Math.PI * 2; n.x = W / 2 + Math.cos(a) * 280; n.y = H / 2 + Math.sin(a) * 260; n.vx = 0; n.vy = 0; });
    const iterations = Math.max(15, Math.min(220, Math.floor(3e7 / Math.max(1, nodes.length ** 2)))); // grafi piccoli: 220 passi come prima
    for (let it = 0; it < iterations; it++) {
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j]; let dx = a.x - b.x, dy = a.y - b.y; const d2 = Math.max(dx * dx + dy * dy, 25), f = 5200 / d2, d = Math.sqrt(d2);
        dx /= d; dy /= d; a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
      }
      for (const e of edges) { const a = nodes[e.s], b = nodes[e.t]; const dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1, f = (d - 110) * 0.02; a.vx += (dx / d) * f; a.vy += (dy / d) * f; b.vx -= (dx / d) * f; b.vy -= (dy / d) * f; }
      for (const n of nodes) { n.vx += (W / 2 - n.x) * 0.002; n.vy += (H / 2 - n.y) * 0.002; n.x = Math.min(W - 30, Math.max(30, n.x + n.vx * 0.5)); n.y = Math.min(H - 20, Math.max(20, n.y + n.vy * 0.5)); n.vx *= 0.6; n.vy *= 0.6; }
    }
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg"); svg.setAttribute("width", W); svg.setAttribute("height", H); svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const mk = (tag, attrs, text) => { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); if (text) el.textContent = text; return el; };
    const lines = edges.map((e) => { const l = mk("line", { x1: nodes[e.s].x, y1: nodes[e.s].y, x2: nodes[e.t].x, y2: nodes[e.t].y, stroke: "#5a4d36", "stroke-width": 1 }); const t = mk("title", {}, e.field); l.append(t); svg.append(l); return l; });
    nodes.forEach((n, i) => {
      const gEl = mk("g", { style: "cursor:pointer" });
      gEl.append(mk("circle", { cx: n.x, cy: n.y, r: 7, fill: TYPE_COLOR[n.type] }), mk("text", { x: n.x + 10, y: n.y + 4, fill: "#ece3d0", "font-size": 11 }, n.name.length > 28 ? n.name.slice(0, 27) + "…" : n.name));
      gEl.append(mk("title", {}, `${n.name} (${TL(n.type)}) — clic per aprire`));
      gEl.addEventListener("click", () => goto(n.type, n.id));
      gEl.addEventListener("mouseenter", () => edges.forEach((e, k) => lines[k].setAttribute("stroke", e.s === i || e.t === i ? "#d8a24a" : "#2e271a")));
      gEl.addEventListener("mouseleave", () => lines.forEach((l) => l.setAttribute("stroke", "#5a4d36")));
      svg.append(gEl);
    });
    wrap.replaceChildren(svg);
    info.textContent = `${nodes.length} elementi, ${edges.length} collegamenti. Passa il mouse su un elemento per evidenziarne i legami; clic per aprirlo.`;
  }
  const info = h("p", { class: "muted" });
  showView(mine, h("h1", {}, "Relazioni tra elementi"), checks, h("div", { class: "row" }, q), info, wrap);
  draw();
}

// ---------------- coerenza ----------------
async function viewCheck() {
  const mine = routeSeq;
  const out = h("div");
  const levels = { errore: true, rischio: true, suggerimento: true };
  let rep;
  async function run() {
    rep = await api("GET", `/api/campaigns/${S.campaign.id}/check`);
    draw();
  }
  function draw() {
    out.replaceChildren(
      h("div", { class: "summary" }, ["errore", "rischio", "suggerimento"].map((k) => h("label", { class: "box" }, h("div", { class: "num" }, rep.summary[k]), h("input", { type: "checkbox", checked: levels[k], onchange: (ev) => { levels[k] = ev.target.checked; draw(); } }), " ", { errore: "Errori certi", rischio: "Rischi narrativi", suggerimento: "Suggerimenti" }[k]))),
      h("p", { class: "muted" }, `Controllo eseguito il ${fmtDate(rep.checkedAt)}.`),
      rep.issues.length === 0 ? h("p", { class: "pill-ok" }, "✓ Nessuna incoerenza rilevata.") : null,
      rep.issues.filter((i) => levels[i.severity]).map((i) => h("div", { class: `issue ${i.severity}` },
        h("div", {}, h("span", { class: "sev" }, i.severity), h("span", { class: "tag" }, i.rule), i.message),
        h("div", {}, "Coinvolti: ", i.entities.map((e) => h("a", { href: `#/c/${S.campaign.id}/${e.type}/${e.id}`, style: "margin-right:.6rem" }, e.name))),
        h("div", { class: "fix" }, "Correzione proposta: " + i.suggestion))));
  }
  showView(mine, h("h1", {}, "Coerenza narrativa"), h("div", { class: "toolbar" }, h("button", { onclick: () => run().catch(fail) }, "Ricontrolla ora"),
    h("span", { class: "muted" }, "Errori = contraddizioni certe · Rischi = probabili problemi · Suggerimenti = migliorie")), out);
  await run();
}

// ---------------- cronologia modifiche ----------------
async function viewHistory() {
  const mine = routeSeq;
  const hist = await api("GET", `/api/campaigns/${S.campaign.id}/history?limit=200`);
  showView(mine, h("h1", {}, "Cronologia delle modifiche"), h("table", {}, h("thead", {}, h("tr", {}, ["Quando", "Elemento", "Versione", "Origine"].map((x) => h("th", {}, x)))),
    h("tbody", {}, hist.map((r) => { const e = byId(r.entityId); return h("tr", e ? { class: "clickable", onclick: () => goto(e.type, e.id) } : {}, h("td", {}, fmtDate(r.at)), h("td", {}, r.name ?? "—", h("span", { class: "tag" }, r.kind)), h("td", {}, "v" + r.version), h("td", {}, r.source + (r.note ? " — " + r.note : ""))); }))));
}

// ---------------- cestino ----------------
async function viewTrash() {
  const mine = routeSeq;
  const trash = await api("GET", `/api/campaigns/${S.campaign.id}/entities?deleted=1`);
  S.deleted = trash.length;
  showView(mine, h("h1", {}, "Cestino"), trash.length ? h("table", {}, h("tbody", {}, trash.map((e) => h("tr", {}, h("td", {}, e.data.name, h("span", { class: "tag" }, TL(e.type))), h("td", {},
    h("button", { class: "secondary small", onclick: async () => { try { await api("POST", `/api/entities/${e.id}/restore`); await loadCampaign(S.campaign.id); toast("Ripristinato.", "ok"); viewTrash(); } catch (er) { fail(er); } } }, "Ripristina"), " ",
    h("button", { class: "danger small", onclick: async () => { const t = await typeToConfirm("Eliminare definitivamente?", "L'operazione non è reversibile (viene creato prima un backup).", e.data.name); if (!t) return; try { await api("POST", `/api/entities/${e.id}/purge`, { confirmName: t }); toast("Eliminato definitivamente.", "ok"); await loadCampaign(S.campaign.id); viewTrash(); } catch (er) { fail(er); } } }, "Elimina per sempre")))))) : h("p", { class: "muted" }, "Il cestino è vuoto."));
}

// ---------------- regole e incontri ----------------
async function viewRules() {
  const mine = routeSeq;
  const info = await api("GET", "/api/rules/info");
  const c = S.campaign;
  const q = h("input", { type: "search", placeholder: "Nome creatura…" });
  const typ = h("select", {}, h("option", { value: "" }, "Tutti i tipi"), info.creatureTypes.map((t) => h("option", { value: t }, t)));
  const maxCr = h("input", { type: "number", min: 0, max: 30, step: "any", placeholder: "GS max", style: "width:6rem" });
  const tb = h("tbody"); const cnt = h("span", { class: "muted" });
  async function search() {
    const qs = new URLSearchParams({ q: q.value, type: typ.value, maxCr: maxCr.value, limit: 60 });
    const list = await api("GET", "/api/rules/creatures?" + qs);
    tb.replaceChildren(...list.map((m) => h("tr", {}, h("td", {}, m.name), h("td", {}, m.type), h("td", {}, m.cr), h("td", {}, m.xp), h("td", {}, m.ac), h("td", {}, m.hp), h("td", {}, m.legendary ? "sì" : ""))));
    cnt.textContent = `${list.length} risultati (max 60)`;
  }
  [q, typ, maxCr].forEach((x) => x.addEventListener("input", () => search().catch(fail)));
  const lvl = h("input", { type: "number", min: 1, max: 20, value: c.startLevel, style: "width:5rem" }), pl = h("input", { type: "number", min: 1, max: 12, value: c.players, style: "width:5rem" });
  const dif = h("select", {}, info.difficulties.map((d) => h("option", { value: d, selected: d === "moderata" }, d))), boss = h("input", { type: "checkbox" }), seed = h("input", { type: "text", placeholder: "seed (opz.)", style: "width:8rem" });
  const res = h("div");
  const budget = h("p", { class: "muted" });
  async function enc() {
    try {
      const r = await api("POST", "/api/rules/encounter", { level: Number(lvl.value), players: Number(pl.value), difficulty: dif.value, boss: boss.checked, seed: seed.value || undefined });
      res.replaceChildren(h("p", {}, h("strong", {}, `${r.totalXp} PE su un budget di ${r.budget}`), ` (difficoltà ${r.difficulty}, livello ${r.level}, ${r.players} giocatori)`),
        h("ul", {}, r.creatures.map((m) => h("li", {}, `${m.count}× ${m.name} — GS ${m.cr}, ${m.xp} PE ciascuno, CA ${m.ac}, PF ${m.hp}`))), h("p", { class: "muted" }, r.source));
    } catch (e) { fail(e); }
  }
  void budget;
  showView(mine, h("h1", {}, "Regole e incontri"),
    h("p", { class: "muted" }, `Versione regole: ${info.version} · ${info.creatureCount} creature SRD importate il ${info.fetched}.`),
    h("h2", {}, "Generatore di incontri bilanciati"),
    h("div", { class: "toolbar" }, "Livello", lvl, "Giocatori", pl, "Difficoltà", dif, h("label", {}, boss, " boss"), seed, h("button", { onclick: enc }, "Genera incontro")), res,
    h("h2", {}, "Creature SRD 5.2"), h("div", { class: "toolbar" }, q, typ, maxCr, cnt),
    h("table", {}, h("thead", {}, h("tr", {}, ["Nome", "Tipo", "GS", "PE", "CA", "PF", "Leggend."].map((x) => h("th", {}, x)))), tb),
    h("h2", {}, "Fonti e stato di verifica"),
    h("table", {}, h("tbody", {}, Object.values(info.sources).map((s) => h("tr", {}, h("td", {}, h("strong", {}, s.what), h("div", { class: "muted" }, s.note)), h("td", {}, s.source, h("div", { class: "muted" }, s.license)), h("td", { class: s.verified ? "pill-ok" : "pill-warn" }, s.verified ? "verificato" : "NON verificato"))))),
    h("p", { class: "muted" }, "Classi, livelli e capacità non sono ancora implementati (vedi docs/FUNZIONI.md)."));
  await search();
}


// ---------------- modalità al tavolo ----------------
// Tutto ciò che serve per giocare la sessione corrente in una schermata, con un tracker compatto affiancato.
async function viewTable(sessionId) {
  const mine = routeSeq;
  const cid = S.campaign.id;
  const sessions = S.entities.filter((e) => e.type === "session").sort((a, b) => a.data.number - b.data.number);
  if (!sessions.length) {
    showView(mine, h("h1", {}, "Al tavolo"), h("p", { class: "muted" }, "Nessuna sessione: crea una sessione e collegale missioni ed eventi per usare questa modalità."),
      h("button", { onclick: () => createEntityDialog("session") }, "＋ Aggiungi sessione"));
    return;
  }
  const cur = sessions.find((s) => s.id === sessionId) ?? sessions.find((s) => !s.data.played) ?? sessions.at(-1);
  const b = await api("GET", `/api/entities/${cur.id}/brief`);
  const nm = (id) => nameOf(id);
  const link = (e) => h("a", { href: `#/c/${cid}/${e.type}/${e.id}` }, e.data.name);
  const li = (label, v) => (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) ? null : h("li", {}, h("strong", {}, label + ": "), Array.isArray(v) ? v.join("; ") : String(v));
  const list = (...items) => { const xs = items.filter(Boolean); return xs.length ? h("ul", {}, xs) : null; };
  const section = (title, items, empty) => [h("h2", {}, title), items.length ? items : h("p", { class: "muted" }, empty)];

  const pick = h("select", { "data-session-pick": "1", onchange: () => (location.hash = `#/c/${cid}/tavolo/${pick.value}`) },
    sessions.map((s) => h("option", { value: s.id, selected: s.id === cur.id }, `${s.data.number}. ${s.data.name}${s.data.played ? " (giocata)" : ""}`)));
  const s = b.session;
  const markPlayed = h("button", { class: "secondary", onclick: async () => {
    try {
      await api("PUT", `/api/entities/${s.id}`, { data: { played: !s.data.played }, expectedVersion: s.version });
      toast(s.data.played ? "Sessione segnata come da giocare." : "Sessione segnata come giocata.", "ok");
      await loadCampaign(cid); renderSidebar("tavolo");
      const target = `#/c/${cid}/tavolo/${s.id}`; // resta su questa sessione anche se ora la "corrente" è un'altra
      if (location.hash === target) route(); else location.hash = target;
    } catch (e) { fail(e); }
  } }, s.data.played ? "Segna come da giocare" : "✓ Segna come giocata");

  const quests = b.quests.map((q) => h("div", { class: "card" }, h("h3", {}, link(q), " ", h("span", { class: "tag" }, q.data.kind), h("span", { class: "tag" }, q.data.status)),
    q.data.premise ? h("p", {}, q.data.premise) : null,
    list(li("Obiettivo", q.data.objective), li("Committente", q.data.giver ? nm(q.data.giver) : ""), li("Ostacoli", q.data.obstacles), li("Svolte", q.data.twists),
      li("Indizi necessari", (q.data.requiredClues ?? []).map(nm)), li("Esiti", (q.data.outcomes ?? []).map((o) => o.label)),
      li("Ricompense", (q.data.rewards ?? []).map((r) => `${r.kind}${r.text ? ": " + r.text : r.item ? ": " + nm(r.item) : ""}`)))));
  const scenes = b.locations.map((l) => {
    const here = b.npcs.filter((n) => n.where === l.id).map((n) => n.entity);
    const dn = b.dungeons.filter((d) => d.data.location === l.id);
    return h("div", { class: "card", "data-scene": l.id }, h("h3", {}, link(l), l.data.access !== "pubblico" ? h("span", { class: "tag" }, l.data.access) : null),
      l.data.description ? h("p", {}, l.data.description) : null,
      list(here.length ? h("li", {}, h("strong", {}, "PNG presenti oggi: "), here.flatMap((n, i) => [i ? ", " : "", link(n)])) : null,
        dn.length ? h("li", {}, h("strong", {}, "Dungeon: "), dn.flatMap((d, i) => [i ? ", " : "", link(d)])) : null,
        li("Sbloccato da", l.data.unlockedBy ? nm(l.data.unlockedBy) : "")));
  });
  const npcs = b.npcs.map(({ entity: n, where }) => h("details", { class: "card", "data-npc": n.id },
    h("summary", {}, h("strong", {}, n.data.name), ` — ${[n.data.role, where ? "a " + nm(where) : ""].filter(Boolean).join(", ")}`, n.data.status !== "vivo" ? h("span", { class: "tag" }, n.data.status) : null),
    n.data.personality ? h("p", {}, n.data.personality) : null,
    list(li("Vuole", [...(n.data.motivations ?? []), ...(n.data.goals ?? [])]),
      li("Sa", (n.data.knowledge ?? []).map((k) => `${k.fact}${k.hidden ? ` (nascosta${k.revealedBy ? `, rivelata da ${nm(k.revealedBy)}` : ""})` : ""}`)),
      li("Mente su", n.data.lies), li("Comportamento", (n.data.behaviors ?? []).map((x) => `se ${x.situation}: ${x.reaction}`)), li("Battute", n.data.dialogues),
      li("Combattimento", (n.data.combat ?? []).map((x) => x.monsterKey || "da definire"))),
    h("a", { href: `#/c/${cid}/npc/${n.id}` }, "Apri scheda completa")));
  const clues = b.clues.map(({ entity: c, blockedBy, after }) => h("div", { class: "card", "data-clue": c.id },
    h("h3", {}, link(c), c.data.truthful ? null : h("span", { class: "tag" }, "falsa pista"), blockedBy.length ? h("span", { class: "tag", title: "Requisiti non ancora soddisfatti" }, "non ancora accessibile") : null),
    h("p", {}, c.data.text),
    list(li("Dove", [c.data.foundAtLocation && nm(c.data.foundAtLocation), c.data.foundWithNpc && "da " + nm(c.data.foundWithNpc), c.data.foundInItem && "in " + nm(c.data.foundInItem)].filter(Boolean)),
      li("Prova", c.data.check), li("Serve prima", blockedBy.map(nm)), li("Dopo l'indizio", after.map(nm)))));
  const evRow = (e) => h("li", {}, h("strong", {}, `Giorno ${e.data.day}`), " — ", link(e), e.data.happened ? h("span", { class: "tag" }, "accaduto") : null,
    e.data.location ? ` a ${nm(e.data.location)}` : "", e.data.trigger ? ` · innesco: ${e.data.trigger}` : "");

  const side = h("div", { class: "side" }, await miniTracker(mine));
  showView(mine, h("h1", {}, "Al tavolo"),
    h("div", { class: "toolbar" }, pick, markPlayed,
      h("a", { class: "btn secondary", target: "_blank", rel: "noopener", href: `/api/entities/${s.id}/export?format=html&inline=1` }, "Scheda stampabile ↗"),
      h("a", { class: "btn secondary", href: `/api/entities/${s.id}/export?format=md` }, "Scheda in Markdown"),
      h("a", { href: `#/c/${cid}/session/${s.id}` }, "Modifica sessione")),
    h("div", { class: "table-mode" },
      h("div", {},
        h("div", { class: "card" }, h("h2", { style: "margin-top:0" }, `Sessione ${s.data.number}: ${s.data.name}`),
          h("p", { class: "muted" }, [s.data.act ? `Atto ${s.data.act}` : "", s.data.chapter ? `capitolo ${s.data.chapter}` : "", `giorno di campagna ${b.campaign.currentDay}`].filter(Boolean).join(" · ")),
          s.data.summary ? h("p", {}, s.data.summary) : null, s.data.notes ? h("p", {}, h("strong", {}, "Note del DM: "), s.data.notes) : null),
        section("Missioni", quests, "Nessuna missione collegata: aggiungile dalla scheda della sessione."),
        section("Scene e luoghi", scenes, "Nessun luogo collegato alle missioni o agli eventi della sessione."),
        section("PNG", npcs, "Nessun PNG coinvolto."),
        section("Indizi ottenibili", clues, "Nessun indizio raggiungibile da questa sessione."),
        section("Eventi della sessione", b.events.length ? [h("ul", {}, b.events.map(evRow))] : [], "Nessun evento collegato."),
        section("Prossimi eventi della campagna", b.upcoming.length ? [h("ul", {}, b.upcoming.map(evRow))] : [], "Nessun evento futuro in programma.")),
      side));
}

/** Tracker compatto per la modalità al tavolo: turno, PF, danno/cure. Usa le stesse azioni del server del tracker completo. */
async function miniTracker(mine) {
  const cid = S.campaign.id, base = `/api/campaigns/${cid}/tracker`;
  let st = await api("GET", base);
  const box = h("div", { class: "card mini-tracker" });
  const act = async (body) => { try { st = await api("POST", base + "/action", body); draw(); } catch (e) { fail(e); } };
  function draw() {
    const rows = st.combatants.map((c, i) => {
      const amt = h("input", { type: "number", min: 0, value: 1 });
      return h("tr", { class: i === st.turn ? "turn" : c.hp === 0 ? "down" : "" }, h("td", {}, i === st.turn ? "▶" : ""), h("td", {}, c.name), h("td", {}, `${c.hp}/${c.maxHp}`),
        h("td", {}, h("div", { class: "row" }, amt, h("button", { class: "danger small", title: "Danno", onclick: () => act({ action: "damage", id: c.id, amount: Number(amt.value) }) }, "−"),
          h("button", { class: "small", title: "Cura", onclick: () => act({ action: "heal", id: c.id, amount: Number(amt.value) }) }, "+"))));
    });
    box.replaceChildren(h("h3", {}, `Combattimento · round ${st.round}`),
      st.combatants.length ? h("table", {}, h("tbody", {}, rows)) : h("p", { class: "muted" }, "Nessuno scontro in corso."),
      h("div", { class: "toolbar" },
        st.combatants.length ? h("button", { onclick: () => act({ action: "next" }) }, "Prossimo turno ▶") : null,
        h("button", { class: "secondary small", title: "Rileggi lo stato (se modificato in un'altra scheda)", onclick: async () => { try { st = await api("GET", base); draw(); } catch (e) { fail(e); } } }, "↻"),
        h("a", { href: `#/c/${cid}/tracker` }, "Tracker completo")));
  }
  draw();
  return box;
}

// ---------------- tracker di combattimento ----------------
async function viewTracker() {
  const mine = routeSeq;
  const cid = S.campaign.id, base = `/api/campaigns/${cid}/tracker`;
  let st = await api("GET", base);
  const act = async (body) => { try { st = await api("POST", base + "/action", body); draw(); } catch (e) { fail(e); } };
  const save = async (next) => {
    try { st = await api("PUT", base, { ...next, expectedRev: st.rev }); draw(); return true; }
    catch (e) {
      if (e.status === 409) { st = await api("GET", base); draw(); toast("Il tracker era stato modificato in un'altra scheda: ho ricaricato lo stato attuale, ripeti l'ultima modifica.", "err"); }
      else if (e.body?.validation) toast(e.body.validation.map((x) => x.message).join("; "), "err"); else fail(e);
      return false;
    }
  };
  // Stessa regola del server: i PG a 0 PF hanno ancora il turno (tiri salvezza contro la morte) finché non sono "morto".
  const dead = (c) => c.conditions.some((x) => /^mort[oa]$/i.test(x));
  const takesTurn = (c) => c.hp > 0 || (c.kind === "pg" && !dead(c));
  const num = (v, w = "5rem") => h("input", { type: "number", value: v ?? "", style: `width:${w}` });
  const f = { name: h("input", { type: "text", placeholder: "Nome" }), kind: h("select", {}, h("option", { value: "mostro" }, "Mostro/PNG"), h("option", { value: "pg" }, "Personaggio")), ini: num(10), hp: num(10), max: num(10), ac: num("") };
  const creatureQ = h("input", { type: "search", placeholder: "Cerca creatura SRD…", style: "width:12rem" });
  const creatureSel = h("select", { style: "width:14rem" }, h("option", { value: "" }, "— risultati —"));
  let found = [], searchSeq = 0;
  creatureQ.addEventListener("input", async () => {
    if (creatureQ.value.trim().length < 2) return;
    const reqNo = ++searchSeq;
    try {
      const res = await api("GET", "/api/rules/creatures?" + new URLSearchParams({ q: creatureQ.value.trim(), limit: 30 }));
      if (reqNo !== searchSeq) return; // è arrivata dopo una ricerca più recente: si scarta
      found = res; creatureSel.replaceChildren(h("option", { value: "" }, `— ${found.length} risultati —`), found.map((m, i) => h("option", { value: i }, `${m.name} (GS ${m.cr}, PF ${m.hp})`))); } catch (e) { fail(e); }
  });
  creatureSel.addEventListener("change", () => {
    const m = found[Number(creatureSel.value)]; if (!m) return;
    f.name.value = m.name; f.kind.value = "mostro"; f.hp.value = f.max.value = m.hp; f.ac.value = m.ac;
  });
  const npcSel = h("select", { style: "width:12rem" }, h("option", { value: "" }, "— aggiungi un PNG —"), S.entities.filter((e) => e.type === "npc").map((e) => h("option", { value: e.id }, e.data.name)));
  npcSel.addEventListener("change", () => { const n = S.entities.find((e) => e.id === npcSel.value); if (n) { f.name.value = n.data.name; f.kind.value = "mostro"; } npcSel.value = ""; });
  const add = async () => {
    const c = { name: f.name.value, kind: f.kind.value, initiative: f.ini.value, hp: f.hp.value, maxHp: f.max.value, ac: f.ac.value === "" ? null : f.ac.value, conditions: [], notes: "" };
    if (await save({ ...st, combatants: [...st.combatants, c] })) { f.name.value = ""; creatureSel.value = ""; }
  };
  const body = h("div");
  function draw() {
    const rows = st.combatants.map((c, i) => {
      const amt = h("input", { type: "number", min: 0, value: 1, style: "width:4rem" });
      const cond = h("input", { type: "text", value: c.conditions.join(", "), placeholder: "condizioni", style: "width:9rem", onchange: () => save({ ...st, combatants: st.combatants.map((x, j) => (j === i ? { ...x, conditions: cond.value.split(",").map((t) => t.trim()).filter(Boolean) } : x)) }) });
      const ini = h("input", { type: "number", value: c.initiative, style: "width:4rem", onchange: () => save({ ...st, combatants: st.combatants.map((x, j) => (j === i ? { ...x, initiative: ini.value } : x)) }) });
      const downTag = c.hp > 0 ? null : c.kind === "pg" ? h("span", { class: "tag" }, dead(c) ? "morto" : "a terra · tiri contro la morte") : h("span", { class: "tag" }, "a terra");
      return h("tr", { class: i === st.turn ? "turn" : c.hp === 0 ? "down" : "" },
        h("td", {}, i === st.turn ? "▶" : ""), h("td", {}, ini), h("td", {}, h("strong", {}, c.name), c.kind === "pg" ? h("span", { class: "tag" }, "PG") : null),
        h("td", {}, `${c.hp} / ${c.maxHp}`, downTag), h("td", {}, c.ac ?? "—"), h("td", {}, cond),
        h("td", {}, h("div", { class: "row" }, amt,
          h("button", { class: "danger small", onclick: () => act({ action: "damage", id: c.id, amount: Number(amt.value) }) }, "Danno"),
          h("button", { class: "small", onclick: () => act({ action: "heal", id: c.id, amount: Number(amt.value) }) }, "Cura"),
          h("button", { class: "secondary small", onclick: () => act({ action: "remove", id: c.id }) }, "Rimuovi"))));
    });
    body.replaceChildren(
      h("div", { class: "toolbar" }, h("strong", {}, `Round ${st.round}`),
        h("button", { onclick: () => act({ action: "next" }), disabled: !st.combatants.some(takesTurn) }, "Prossimo turno ▶"),
        h("button", { class: "secondary", onclick: () => act({ action: "sort" }) }, "Ordina per iniziativa"),
        h("button", { class: "secondary", onclick: async () => { if (await confirmDialog("Ripristinare i PF?", "Tutti i partecipanti tornano ai PF massimi, senza condizioni, e il round riparte da 1.", "Ripristina")) act({ action: "restart" }); } }, "Ripristina PF"),
        h("button", { class: "danger", onclick: async () => { if (await confirmDialog("Nuovo scontro?", "L'elenco dei partecipanti verrà svuotato.", "Svuota", true)) act({ action: "clear" }); } }, "Nuovo scontro")),
      st.combatants.length ? h("table", {}, h("thead", {}, h("tr", {}, ["", "Iniz.", "Nome", "PF", "CA", "Condizioni", "Azioni"].map((x) => h("th", {}, x)))), h("tbody", {}, rows)) : h("p", { class: "muted" }, "Nessun partecipante. Aggiungine qui sotto."));
  }
  showView(mine, h("h1", {}, "Tracker di combattimento"),
    h("p", { class: "muted" }, "Stato di sessione salvato in locale per questa campagna (incluso nell'esportazione JSON, nei backup e, se c'è uno scontro in corso, nelle esportazioni leggibili). Il tracker tiene iniziativa, PF e condizioni; salta i mostri a 0 PF, mentre i PG a 0 PF mantengono il turno per i tiri salvezza contro la morte (scrivi la condizione \"morto\" per toglierli dal giro). Nessun'altra regola di combattimento è applicata."),
    body,
    h("h2", {}, "Aggiungi partecipante"),
    h("div", { class: "toolbar" }, creatureQ, creatureSel, npcSel),
    h("div", { class: "toolbar" }, f.name, f.kind, "Iniz.", f.ini, "PF", f.hp, "PF max", f.max, "CA", f.ac, h("button", { onclick: add }, "Aggiungi")));
  draw();
}

// ---------------- esportazione, stampa, backup ----------------
async function viewExport() {
  const mine = routeSeq;
  const c = S.campaign;
  const backups = await api("GET", "/api/backups");
  const fileIn = h("input", { type: "file", accept: ".json", hidden: true, onchange: async () => {
    const f = fileIn.files[0]; if (!f) return;
    try { const payload = JSON.parse(await f.text()); const n = await api("POST", "/api/import", { payload }); toast(`Importata come nuova campagna "${n.title}".`, "ok"); location.hash = `#/c/${n.id}/panoramica`; } catch (e) { fail(e); } fileIn.value = "";
  } });
  showView(mine, h("h1", {}, "Esporta, stampa, backup"),
    h("h2", {}, "Esportazione"),
    h("div", { class: "toolbar" },
      h("a", { class: "btn", href: `/api/campaigns/${c.id}/export?format=json` }, "Scarica JSON (completo, reimportabile)"),
      h("a", { class: "btn", href: `/api/campaigns/${c.id}/export?format=md` }, "Scarica Markdown"),
      h("a", { class: "btn", href: `/api/campaigns/${c.id}/export?format=html` }, "Scarica HTML"),
      h("a", { class: "btn secondary", target: "_blank", rel: "noopener", href: `/api/campaigns/${c.id}/export?format=html&inline=1` }, "Anteprima di stampa ↗")),
    h("p", { class: "muted" }, "L'anteprima di stampa si apre in una nuova scheda: usa Ctrl+P per stampare o salvare in PDF."),
    h("h2", {}, "Backup e ripristino"),
    h("div", { class: "toolbar" },
      h("button", { onclick: async () => { try { const b = await api("POST", `/api/campaigns/${c.id}/backup`); toast(`Backup creato e verificato: ${b.file}`, "ok", 7000); viewExport(); } catch (e) { fail(e); } } }, "Crea backup ora"),
      h("button", { class: "secondary", onclick: () => fileIn.click() }, "Importa file JSON come nuova campagna…"), fileIn),
    h("p", { class: "muted" }, `Cartella dei backup: ${S.status.backupDir}`),
    backups.length ? h("table", {}, h("thead", {}, h("tr", {}, ["File", "Data", "Dimensione", ""].map((x) => h("th", {}, x)))), h("tbody", {}, backups.map((b) => h("tr", {}, h("td", {}, b.file), h("td", {}, fmtDate(b.at)), h("td", {}, Math.round(b.bytes / 1024) + " KB"),
      h("td", {}, h("button", { class: "secondary small", onclick: async () => {
        if (!(await confirmDialog("Ripristinare il backup?", "Se la campagna esiste ancora verrà sostituita dal contenuto del backup (viene creato prima un backup dello stato attuale). Se era stata eliminata viene ricreata.", "Ripristina", true))) return;
        try { const r = await api("POST", "/api/backups/restore", { file: b.file }); toast(`Ripristinata "${r.title}".`, "ok"); location.hash = `#/c/${r.id}/panoramica`; await route(); } catch (e) { fail(e); }
      } }, "Ripristina")))))) : h("p", { class: "muted" }, "Nessun backup presente."));
}

// ---------------- impostazioni IA ----------------
async function viewSettings() {
  const mine = routeSeq;
  S.campaign = null; $side.hidden = true; document.getElementById("campaign-title").textContent = "";
  const s = await api("GET", "/api/settings/ai");
  const st = await api("POST", "/api/ai/test");
  const f = (k, v, type = "text") => h("input", { type, value: v, "data-k": k });
  const inputs = { baseUrl: f("baseUrl", s.baseUrl), model: f("model", s.model), timeoutMs: f("timeoutMs", s.timeoutMs, "number"), numCtx: f("numCtx", s.numCtx, "number"), numPredict: f("numPredict", s.numPredict, "number"), temperature: f("temperature", s.temperature, "number") };
  inputs.temperature.step = "0.1";
  const prov = h("select", {}, h("option", { value: "deterministic" }, "Deterministico (nessuna IA, nessuna rete)"), h("option", { value: "ollama" }, "IA locale con Ollama"));
  prov.value = s.provider;
  const stBox = h("p", { class: st.available ? "pill-ok" : "pill-warn" }, (st.available ? "✓ " : "⚠ ") + st.message);
  showView(mine, h("h1", {}, "Impostazioni IA locale"),
    h("p", {}, "La modalità deterministica funziona sempre. L'IA locale (Ollama) è facoltativa e riscrive soltanto singoli campi di testo: i dati strutturati restano la fonte di verità."),
    stBox,
    h("div", { class: "form" },
      h("div", { class: "field" }, h("label", { class: "lbl" }, "Modalità di rigenerazione dei testi"), prov),
      ...[["baseUrl", "Indirizzo di Ollama (solo locale)"], ["model", "Modello"], ["timeoutMs", "Timeout (ms)"], ["numCtx", "Finestra di contesto (limita la memoria)"], ["numPredict", "Lunghezza massima risposta (token)"], ["temperature", "Temperatura"]].map(([k, l]) => h("div", { class: "field" }, h("label", { class: "lbl" }, l), inputs[k])),
      h("div", { class: "row" },
        h("button", { onclick: async () => {
          try {
            const body = { provider: prov.value, baseUrl: inputs.baseUrl.value, model: inputs.model.value.trim(), timeoutMs: Number(inputs.timeoutMs.value), numCtx: Number(inputs.numCtx.value), numPredict: Number(inputs.numPredict.value), temperature: Number(inputs.temperature.value) };
            const r = await api("PUT", "/api/settings/ai", body); toast("Impostazioni salvate. " + r.status.message, r.status.available || body.provider === "deterministic" ? "ok" : "info", 7000); await refreshStatus(); viewSettings();
          } catch (e) { fail(e); }
        } }, "Salva impostazioni"),
        h("button", { class: "secondary", onclick: async () => { try { const r = await api("POST", "/api/ai/test"); stBox.className = r.available ? "pill-ok" : "pill-warn"; stBox.textContent = (r.available ? "✓ " : "⚠ ") + r.message; } catch (e) { fail(e); } } }, "Verifica connessione"))),
    h("p", { class: "muted" }, "Per installare Ollama e un modello adatto: esegui scripts\\install.ps1 -InstallOllama -PullModel (vedi README)."));
}

boot();
