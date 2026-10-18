// Utility UI: creazione DOM sicura (solo textContent), chiamate API, toast, finestre modali e form guidati dallo schema.

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "value") value = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  if (value !== undefined) el.value = value;
  return el;
}

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error ?? `Errore HTTP ${status}`);
    this.status = status; this.body = body ?? {};
  }
}

export async function api(method, url, body) {
  let res;
  try {
    res = await fetch(url, { method, headers: body !== undefined ? { "content-type": "application/json" } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, { error: "Impossibile contattare il server locale. Verifica che l'applicazione sia in esecuzione." });
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text.slice(0, 200) }; }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export function toast(msg, kind = "info", ms = 4500) {
  const t = h("div", { class: `toast ${kind}`, role: "status" }, msg);
  document.getElementById("toasts").append(t);
  setTimeout(() => t.remove(), kind === "err" ? Math.max(ms, 8000) : ms);
}
export const fail = (e) => { console.error(e); toast(e.message ?? String(e), "err"); };

/**
 * Finestra modale. opts.guard: () => true se l'utente ha inserito dati; in quel caso chiudere senza confermare
 * (Annulla, Esc) chiede prima conferma.
 */
export function modal(title, content, buttons, { guard } = {}) {
  return new Promise((resolve) => {
    const root = document.getElementById("modal-root");
    const close = (v) => { bg.remove(); resolve(v); };
    const cancel = async (v) => {
      if (guard?.() && !(await confirmDialog("Dati non salvati", "Chiudendo la finestra i dati inseriti andranno persi. Continuare?", "Chiudi senza salvare", true))) return;
      close(v);
    };
    const isCancel = (b) => !b.onclick && (b.value === null || b.value === false || b.value === undefined);
    const actions = h("div", { class: "actions" }, buttons.map((b) => h("button", { class: b.cls ?? "", onclick: async () => {
      if (isCancel(b)) return cancel(b.value);
      if (b.onclick) { const keep = await b.onclick(); if (keep === false) return; }
      close(b.value);
    } }, b.label)));
    const bg = h("div", { class: "modal-bg", onkeydown: (e) => { if (e.key === "Escape" && e.target.closest(".modal-bg") === bg) { e.stopPropagation(); cancel(undefined); } } }, h("div", { class: "modal", role: "dialog", "aria-modal": "true" }, h("h2", {}, title), content, actions));
    root.append(bg);
    bg.querySelector("input,select,textarea,button")?.focus();
  });
}
export const confirmDialog = (title, text, label = "Conferma", danger = false) =>
  modal(title, h("p", {}, text), [{ label: "Annulla", value: false, cls: "secondary" }, { label, value: true, cls: danger ? "danger" : "" }]);
export async function typeToConfirm(title, text, expected) {
  const input = h("input", { type: "text", placeholder: expected });
  const r = await modal(title, h("div", {}, h("p", {}, text), h("p", {}, "Per confermare scrivi: ", h("strong", {}, expected)), input), [
    { label: "Annulla", value: null, cls: "secondary" }, { label: "Elimina", value: "ok", cls: "danger", onclick: () => { if (input.value !== expected) { toast("Testo di conferma non corrispondente", "err"); return false; } } }]);
  return r === "ok" ? expected : null;
}

/** Testo ricercabile di un elemento (stessa regola del server): solo testi ed enum, mai chiavi JSON né id. */
export function searchableText(fields, data) {
  const out = [];
  for (const f of fields) {
    const v = data?.[f.k];
    if (v == null) continue;
    if (["string", "text", "enum"].includes(f.t)) out.push(String(v));
    else if (f.t === "strings") out.push(...v);
    else if (f.t === "list") for (const it of v) out.push(searchableText(f.fields, it));
  }
  return out.join("\n").toLocaleLowerCase("it");
}

// ---------- unione delle modifiche dopo un conflitto (409) ----------
/** Forma confrontabile di un valore secondo il campo: vuoti equivalenti (null, "", campo assente) diventano uguali. */
export function normField(f, v) {
  switch (f.t) {
    case "string": case "text": return v == null ? "" : String(v);
    case "int": return v === "" || v == null ? null : Number(v);
    case "bool": return !!v;
    case "enum": return v == null || v === "" ? (f.def ?? "") : v;
    case "ref": return v || null;
    case "refs": case "strings": return Array.isArray(v) ? v : [];
    case "list": return (Array.isArray(v) ? v : []).map((it) => Object.fromEntries(f.fields.filter((s) => s.t !== "grid").map((s) => [s.k, normField(s, it?.[s.k])])));
    default: return v ?? null;
  }
}
const same = (f, a, b) => JSON.stringify(normField(f, a)) === JSON.stringify(normField(f, b));
/**
 * Unione a tre vie per campo: base = dati caricati quando si è aperto il modulo, mine = bozza, theirs = versione salvata altrove.
 * Cambiato solo da me: resta mio; solo dall'altra parte: si prende il loro; da entrambi in modo diverso: conflitto da scegliere.
 */
export function mergeForConflict(fields, base, mine, theirs) {
  const merged = {}, conflicts = [], takenTheirs = [], keptMine = [];
  for (const f of fields) {
    if (!(f.k in mine)) continue;
    const meChanged = !same(f, base?.[f.k], mine[f.k]), theyChanged = !same(f, base?.[f.k], theirs?.[f.k]);
    if (meChanged && theyChanged && !same(f, mine[f.k], theirs?.[f.k])) { conflicts.push({ f, mine: mine[f.k], theirs: theirs?.[f.k] }); merged[f.k] = mine[f.k]; }
    else if (meChanged) { merged[f.k] = mine[f.k]; keptMine.push(f.label); }
    else { merged[f.k] = theirs?.[f.k] ?? mine[f.k]; if (theyChanged) takenTheirs.push(f.label); }
  }
  return { merged, conflicts, takenTheirs, keptMine };
}
/** Anteprima breve e leggibile di un valore (per la finestra di scelta). */
export function previewValue(f, v, nameOf = (id) => id) {
  const n = normField(f, v);
  let s;
  if (f.t === "ref") s = n ? nameOf(n) : "—";
  else if (f.t === "refs") s = n.map(nameOf).join(", ");
  else if (f.t === "strings") s = n.join(" · ");
  else if (f.t === "list") s = `${n.length} voci: ` + n.map((it) => Object.values(it).filter((x) => typeof x === "string" && x).slice(0, 2).join(" — ")).join(" · ");
  else if (f.t === "grid") s = "mappa modificata";
  else if (f.t === "bool") s = n ? "sì" : "no";
  else s = n === null || n === "" ? "—" : typeof n === "object" ? JSON.stringify(n) : String(n);
  return s.length > 220 ? s.slice(0, 219) + "…" : s || "—";
}

export const fmtDate = (s) => new Date(s).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });

// ---------- form guidati dallo schema ----------
/** ctx: { entities: [{id,type,data}], selfId } ; ritorna { el, get() } */
export function control(def, value, ctx) {
  const t = def.t;
  if (t === "string") { const i = h("input", { type: "text", value: value ?? "" }); return { el: i, get: () => i.value }; }
  if (t === "text") { const i = h("textarea", { value: value ?? "" }); return { el: i, get: () => i.value }; }
  if (t === "int") { const i = h("input", { type: "number", step: "1", min: def.min, max: def.max, value: value ?? "" }); return { el: i, get: () => (i.value === "" ? null : Number(i.value)) }; }
  if (t === "bool") { const i = h("input", { type: "checkbox" }); i.checked = !!value; return { el: i, get: () => i.checked }; }
  if (t === "enum") {
    const s = h("select", {}, !def.req || value === undefined || value === null ? h("option", { value: "" }, "—") : null, def.opts.map((o) => h("option", { value: o }, o)));
    s.value = value ?? def.def ?? (def.req ? def.opts[0] : "");
    return { el: s, get: () => s.value };
  }
  if (t === "ref") {
    const cands = ctx.entities.filter((e) => (!def.refTypes || def.refTypes.includes(e.type)) && e.id !== ctx.selfId);
    const s = h("select", {}, h("option", { value: "" }, "—"), cands.map((e) => h("option", { value: e.id }, `${e.data.name} (${typeLabel(ctx, e.type)})`)));
    if (value && !cands.some((e) => e.id === value)) s.append(h("option", { value }, `⚠ riferimento non valido`));
    s.value = value ?? "";
    return { el: s, get: () => s.value || null };
  }
  if (t === "refs") {
    const cands = ctx.entities.filter((e) => (!def.refTypes || def.refTypes.includes(e.type)) && e.id !== ctx.selfId);
    let sel = [...(value ?? [])];
    const chips = h("div", { class: "chips" });
    const add = h("select", { onchange: () => { if (add.value && !sel.includes(add.value)) { sel.push(add.value); render(); } add.value = ""; } },
      h("option", { value: "" }, "+ aggiungi…"), cands.map((e) => h("option", { value: e.id }, `${e.data.name} (${typeLabel(ctx, e.type)})`)));
    const name = (id) => ctx.entities.find((e) => e.id === id)?.data.name ?? "⚠ " + id;
    function render() {
      chips.replaceChildren(...sel.map((id) => h("span", { class: "chip" }, name(id), h("button", { type: "button", title: "Rimuovi", onclick: () => { sel = sel.filter((x) => x !== id); render(); } }, "✕"))));
    }
    render();
    return { el: h("div", {}, chips, add), get: () => sel };
  }
  if (t === "strings") { const i = h("textarea", { value: (value ?? []).join("\n"), placeholder: "Un elemento per riga" }); return { el: i, get: () => i.value.split("\n").map((s) => s.trim()).filter(Boolean) }; }
  if (t === "json") { const i = h("textarea", { value: value ? JSON.stringify(value, null, 1) : "" }); return { el: i, get: () => { if (!i.value.trim()) return null; try { return JSON.parse(i.value); } catch { throw new Error(`${def.label}: JSON non valido`); } } }; }
  if (t === "list") {
    const rows = [];
    const box = h("div", {});
    const addBtn = h("button", { type: "button", class: "secondary small", onclick: () => { addRow({}); } }, `+ ${def.label}`);
    function addRow(v) {
      const subs = def.fields.filter((f) => !["grid"].includes(f.t)).map((f) => ({ def: f, c: control(f, v?.[f.k] ?? (f.def !== undefined ? f.def : undefined), ctx) }));
      const row = h("div", { class: "subform" },
        subs.map((s) => h("div", { class: "field" }, h("label", { class: "lbl" }, s.def.label, s.def.req ? h("span", { class: "req" }, " *") : null), s.c.el)),
        h("button", { type: "button", class: "danger small", onclick: () => { rows.splice(rows.indexOf(entry), 1); row.remove(); updateAdd(); } }, "Rimuovi"));
      const entry = { subs, row };
      rows.push(entry); box.append(row); updateAdd();
    }
    function updateAdd() { addBtn.disabled = !!def.max && rows.length >= def.max; }
    (value ?? []).forEach(addRow);
    return {
      el: h("div", {}, box, addBtn),
      get: () => rows.map((r) => Object.fromEntries(r.subs.map((s) => [s.def.k, s.c.get()]))),
    };
  }
  return { el: h("em", {}, `(campo ${t} non modificabile qui)`), get: () => value };
}

export const typeLabel = (ctx, type) => ctx.schema?.entityTypes[type]?.label ?? type;

/** Costruisce il form per un insieme di campi. Ritorna { el, collect() } */
export function buildForm(fields, data, ctx, { skip = [], extra } = {}) {
  const parts = fields.filter((f) => !skip.includes(f.k) && f.t !== "grid").map((f) => {
    const c = control(f, data?.[f.k], ctx);
    const err = h("div", { class: "err" });
    const extraEl = extra ? extra(f) : null;
    return { f, c, err, el: h("div", { class: "field", "data-field": f.k }, h("label", { class: "lbl" }, f.label, f.req ? h("span", { class: "req" }, " *") : null, extraEl), c.el, err) };
  });
  return {
    el: h("div", { class: "form" }, parts.map((p) => p.el)),
    collect() {
      const out = {};
      for (const p of parts) out[p.f.k] = p.c.get();
      return out;
    },
    showErrors(list) {
      parts.forEach((p) => (p.err.textContent = ""));
      const general = [];
      for (const e of list ?? []) {
        const key = e.path.split(/[.[]/)[0];
        const p = parts.find((x) => x.f.k === key);
        if (p) p.err.textContent += (p.err.textContent ? " · " : "") + e.path + ": " + e.message; else general.push(e);
      }
      return general;
    },
  };
}
