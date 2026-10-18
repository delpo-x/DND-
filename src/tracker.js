// Tracker di combattimento: stato di sessione (iniziativa, PF, turno, round) validato lato server.
// Lo stato è salvato per campagna nelle impostazioni del database ed è incluso in esportazione JSON e backup (store.exportPayload).
import { ValidationError } from "./schema.js";

export const EMPTY_TRACKER = { round: 1, turn: 0, rev: 0, combatants: [] };
const MAX_COMBATANTS = 60;

function int(v, path, errors, { min, max, nullable = false }) {
  if ((v === null || v === undefined || v === "") && nullable) return null;
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (!Number.isInteger(n)) { errors.push({ path, message: "deve essere un numero intero" }); return 0; }
  if (n < min || n > max) { errors.push({ path, message: `deve essere tra ${min} e ${max}` }); return 0; }
  return n;
}

/** Valida e normalizza lo stato. Lancia ValidationError con l'elenco degli errori per campo. */
export function normalizeTracker(input) {
  const errors = [];
  if (!input || typeof input !== "object" || !Array.isArray(input.combatants)) throw new ValidationError([{ path: "combatants", message: "elenco partecipanti mancante" }]);
  if (input.combatants.length > MAX_COMBATANTS) throw new ValidationError([{ path: "combatants", message: `massimo ${MAX_COMBATANTS} partecipanti` }]);
  const seen = new Set();
  const combatants = input.combatants.map((c, i) => {
    const p = `combatants[${i}]`;
    const name = typeof c?.name === "string" ? c.name.trim() : "";
    if (!name || name.length > 80) errors.push({ path: `${p}.name`, message: "nome obbligatorio (max 80 caratteri)" });
    const id = typeof c?.id === "string" && /^[\w-]{1,40}$/.test(c.id) && !seen.has(c.id) ? c.id : `c${i}_${Math.random().toString(36).slice(2, 8)}`;
    seen.add(id);
    const maxHp = int(c?.maxHp, `${p}.maxHp`, errors, { min: 1, max: 9999 });
    const hp = int(c?.hp, `${p}.hp`, errors, { min: 0, max: 9999 });
    if (maxHp && hp > maxHp) errors.push({ path: `${p}.hp`, message: "i PF non possono superare i PF massimi" });
    const conditions = Array.isArray(c?.conditions) ? c.conditions.map((x) => String(x).trim()).filter(Boolean) : [];
    if (conditions.length > 10 || conditions.some((x) => x.length > 30)) errors.push({ path: `${p}.conditions`, message: "massimo 10 condizioni di 30 caratteri" });
    const notes = typeof c?.notes === "string" ? c.notes : "";
    if (notes.length > 300) errors.push({ path: `${p}.notes`, message: "massimo 300 caratteri" });
    return {
      id, name, kind: c?.kind === "pg" ? "pg" : "mostro",
      initiative: int(c?.initiative, `${p}.initiative`, errors, { min: -20, max: 60 }),
      hp, maxHp, ac: int(c?.ac, `${p}.ac`, errors, { min: 0, max: 40, nullable: true }),
      conditions, notes, source: typeof c?.source === "string" ? c.source.slice(0, 80) : "",
    };
  });
  const round = int(input.round ?? 1, "round", errors, { min: 1, max: 9999 });
  let turn = int(input.turn ?? 0, "turn", errors, { min: 0, max: 9999 });
  if (combatants.length && turn >= combatants.length) errors.push({ path: "turn", message: "turno fuori dall'elenco" });
  if (!combatants.length) turn = 0;
  // Revisione dello stato, gestita dal server: serve a rifiutare salvataggi da una scheda non aggiornata.
  const rev = int(input.rev ?? 0, "rev", errors, { min: 0, max: Number.MAX_SAFE_INTEGER });
  if (errors.length) throw new ValidationError(errors);
  return { round, turn, rev, combatants };
}

const isDead = (c) => c.conditions.some((x) => /^mort[oa]$/i.test(x));
/**
 * Chi ha ancora un turno: chiunque abbia PF > 0, e i PG a 0 PF (devono fare i tiri salvezza contro la morte)
 * finché non sono segnati con la condizione "morto". I mostri a 0 PF vengono saltati.
 */
export const takesTurn = (c) => c.hp > 0 || (c.kind === "pg" && !isDead(c));

/** Ordina per iniziativa decrescente (a parità: PG prima dei mostri, poi nome) mantenendo il combattente di turno. */
export function sortByInitiative(state) {
  const current = state.combatants[state.turn]?.id;
  const combatants = [...state.combatants].sort((a, b) => b.initiative - a.initiative || (a.kind === b.kind ? 0 : a.kind === "pg" ? -1 : 1) || a.name.localeCompare(b.name, "it"));
  const turn = Math.max(0, combatants.findIndex((c) => c.id === current));
  return { ...state, combatants, turn };
}

/** Avanza al prossimo partecipante che ha un turno (vedi takesTurn); incrementa il round al giro completo. Se nessuno ne ha, non si muove. */
export function nextTurn(state) {
  const n = state.combatants.length;
  if (!n || !state.combatants.some(takesTurn)) return state;
  let { turn, round } = state;
  for (let k = 0; k < n; k++) {
    turn += 1;
    if (turn >= n) { turn = 0; round += 1; }
    if (takesTurn(state.combatants[turn])) break;
  }
  return { ...state, turn, round };
}

/** Applica danno (n>0) o cure (n<0 non usato: usare heal). I PF non scendono sotto 0 né superano il massimo. */
export function applyHp(combatant, delta) {
  const hp = Math.min(combatant.maxHp, Math.max(0, combatant.hp + delta));
  return { ...combatant, hp };
}

/** Esegue un'azione sul tracker. Ritorna il nuovo stato (già validato). */
export function trackerAction(state, { action, id, amount }) {
  const idx = state.combatants.findIndex((c) => c.id === id);
  const need = () => { if (idx < 0) throw new ValidationError([{ path: "id", message: "partecipante non trovato" }]); };
  const amt = () => { if (!Number.isInteger(amount) || amount < 0 || amount > 9999) throw new ValidationError([{ path: "amount", message: "quantità non valida (intero 0-9999)" }]); return amount; };
  let next;
  switch (action) {
    case "sort": next = sortByInitiative(state); break;
    case "next": next = nextTurn(state); break;
    case "damage": need(); next = { ...state, combatants: state.combatants.map((c, i) => (i === idx ? applyHp(c, -amt()) : c)) }; break;
    case "heal": need(); next = { ...state, combatants: state.combatants.map((c, i) => (i === idx ? applyHp(c, amt()) : c)) }; break;
    case "remove": {
      need();
      const combatants = state.combatants.filter((_, i) => i !== idx);
      // il turno resta sullo stesso combattente; se si rimuove quello di turno, passa al successivo nell'ordine
      // (se era l'ultimo, si ricomincia dal primo con un nuovo round)
      let turn = state.turn, round = state.round;
      if (idx < state.turn) turn -= 1;
      else if (idx === state.turn && idx >= combatants.length) { turn = 0; if (combatants.length) round += 1; }
      next = { ...state, combatants, turn, round };
      break;
    }
    case "clear": next = { ...EMPTY_TRACKER }; break;
    case "restart": next = { round: 1, turn: 0, rev: state.rev, combatants: state.combatants.map((c) => ({ ...c, hp: c.maxHp, conditions: [] })) }; break;
    default: throw new ValidationError([{ path: "action", message: "azione sconosciuta" }]);
  }
  return normalizeTracker(next);
}
