// Schema dati esplicito: unica fonte di verità per validazione (server) e form (UI).
// Tipi di campo: string, text, int, bool, enum, ref (1 id), refs (lista id), strings (lista testi), list (lista di oggetti con `fields`).

export const SCHEMA_VERSION = 1;

const ANY_ENTITY = ["location", "npc", "faction", "quest", "clue", "mystery", "item", "event", "session", "dungeon"];

const effectFields = [
  { k: "kind", label: "Tipo effetto", t: "enum", opts: ["npcStatus", "npcLocation", "factionStanding", "questStatus", "locationAccess", "nota"], req: true },
  { k: "target", label: "Bersaglio", t: "ref", refTypes: ANY_ENTITY },
  { k: "value", label: "Valore (testo/numero)", t: "string" },
  { k: "valueRef", label: "Valore (luogo, per spostamenti PNG)", t: "ref", refTypes: ["location"] },
];

export const ENTITY_TYPES = {
  location: {
    label: "Luogo", plural: "Luoghi",
    fields: [
      { k: "name", label: "Nome", t: "string", req: true },
      { k: "kind", label: "Tipo", t: "enum", opts: ["continente", "regione", "città", "villaggio", "dungeon", "edificio", "natura", "luogo"], req: true },
      { k: "parent", label: "Contenuto in", t: "ref", refTypes: ["location"] },
      { k: "description", label: "Descrizione", t: "text" },
      { k: "history", label: "Storia ed eventi passati", t: "text" },
      { k: "culture", label: "Cultura, religioni, organizzazioni", t: "text" },
      { k: "economy", label: "Economia locale", t: "text" },
      { k: "politics", label: "Condizioni politiche e conflitti", t: "text" },
      { k: "resources", label: "Risorse", t: "strings" },
      { k: "legends", label: "Leggende e misteri", t: "strings" },
      { k: "access", label: "Accesso", t: "enum", opts: ["pubblico", "segreto", "bloccato"], req: true, def: "pubblico" },
      { k: "unlockedBy", label: "Sbloccato da (missione/evento/indizio)", t: "ref", refTypes: ["quest", "event", "clue"] },
      { k: "connections", label: "Percorsi verso altri luoghi", t: "list", fields: [
        { k: "to", label: "Destinazione", t: "ref", refTypes: ["location"], req: true },
        { k: "via", label: "Percorso", t: "string" },
        { k: "days", label: "Giorni di viaggio", t: "int" },
      ] },
    ],
  },
  npc: {
    label: "PNG", plural: "PNG",
    fields: [
      { k: "name", label: "Nome", t: "string", req: true },
      { k: "species", label: "Specie", t: "string" },
      { k: "role", label: "Ruolo", t: "string" },
      { k: "description", label: "Aspetto e descrizione", t: "text" },
      { k: "personality", label: "Personalità", t: "text" },
      { k: "motivations", label: "Motivazioni", t: "strings" },
      { k: "goals", label: "Obiettivi", t: "strings" },
      { k: "fears", label: "Paure", t: "strings" },
      { k: "conflicts", label: "Conflitti interiori/esterni", t: "strings" },
      { k: "status", label: "Stato", t: "enum", opts: ["vivo", "morto", "scomparso", "prigioniero"], req: true, def: "vivo" },
      { k: "location", label: "Luogo abituale", t: "ref", refTypes: ["location"] },
      { k: "schedule", label: "Spostamenti (per giorno di campagna)", t: "list", fields: [
        { k: "fromDay", label: "Dal giorno", t: "int", req: true },
        { k: "toDay", label: "Al giorno", t: "int", req: true },
        { k: "location", label: "Luogo", t: "ref", refTypes: ["location"], req: true },
      ] },
      { k: "knowledge", label: "Informazioni note", t: "list", fields: [
        { k: "fact", label: "Informazione", t: "string", req: true },
        { k: "hidden", label: "Nascosta ai giocatori", t: "bool" },
        { k: "source", label: "Fonte plausibile", t: "ref", refTypes: ANY_ENTITY },
        { k: "revealedBy", label: "Rivelata dall'indizio", t: "ref", refTypes: ["clue"] },
      ] },
      { k: "secrets", label: "Segreti", t: "strings" },
      { k: "lies", label: "Bugie che racconta", t: "strings" },
      { k: "relationships", label: "Relazioni con altri PNG", t: "list", fields: [
        { k: "npc", label: "PNG", t: "ref", refTypes: ["npc"], req: true },
        { k: "kind", label: "Tipo", t: "enum", opts: ["alleato", "rivale", "debito", "favore", "famiglia", "mentore", "nemico"], req: true },
        { k: "note", label: "Nota", t: "string" },
      ] },
      { k: "factions", label: "Appartenenze", t: "refs", refTypes: ["faction"] },
      { k: "behaviors", label: "Comportamento previsto", t: "list", fields: [
        { k: "situation", label: "Situazione", t: "string", req: true },
        { k: "reaction", label: "Reazione", t: "string", req: true },
      ] },
      { k: "dialogues", label: "Dialoghi di esempio", t: "strings" },
      { k: "combat", label: "Scheda di combattimento (creatura SRD di riferimento)", t: "list", max: 1, fields: [
        { k: "monsterKey", label: "Creatura SRD 5.2", t: "string" },
        { k: "note", label: "Adattamenti", t: "string" },
      ] },
    ],
  },
  faction: {
    label: "Fazione", plural: "Fazioni",
    fields: [
      { k: "name", label: "Nome", t: "string", req: true },
      { k: "stance", label: "Atteggiamento verso il gruppo", t: "enum", opts: ["alleata", "neutrale", "ostile"], req: true, def: "neutrale" },
      { k: "standing", label: "Reputazione (-5..+5)", t: "int", min: -5, max: 5 },
      { k: "description", label: "Descrizione", t: "text" },
      { k: "goals", label: "Obiettivi", t: "strings" },
      { k: "resources", label: "Risorse", t: "strings" },
      { k: "leader", label: "Capo", t: "ref", refTypes: ["npc"] },
      { k: "headquarters", label: "Sede", t: "ref", refTypes: ["location"] },
      { k: "territories", label: "Territori", t: "refs", refTypes: ["location"] },
      { k: "relations", label: "Rapporti con altre fazioni", t: "list", fields: [
        { k: "faction", label: "Fazione", t: "ref", refTypes: ["faction"], req: true },
        { k: "kind", label: "Rapporto", t: "enum", opts: ["alleata", "rivale", "nemica", "neutrale"], req: true },
      ] },
    ],
  },
  quest: {
    label: "Missione", plural: "Missioni",
    fields: [
      { k: "name", label: "Titolo", t: "string", req: true },
      { k: "kind", label: "Tipo", t: "enum", opts: ["principale", "secondaria"], req: true, def: "secondaria" },
      { k: "act", label: "Atto", t: "int", min: 1 },
      { k: "chapter", label: "Capitolo", t: "int", min: 1 },
      { k: "premise", label: "Premessa", t: "text", req: true },
      { k: "giver", label: "Committente", t: "ref", refTypes: ["npc"] },
      { k: "objective", label: "Obiettivo", t: "text", req: true },
      { k: "prerequisites", label: "Prerequisiti", t: "list", fields: [
        { k: "target", label: "Richiede", t: "ref", refTypes: ["quest", "event", "clue"], req: true },
        { k: "intentionalCycle", label: "Ciclo intenzionale", t: "bool" },
      ] },
      { k: "locations", label: "Luoghi", t: "refs", refTypes: ["location"] },
      { k: "npcs", label: "PNG coinvolti", t: "refs", refTypes: ["npc"] },
      { k: "clues", label: "Indizi che la missione offre", t: "refs", refTypes: ["clue"] },
      { k: "requiredClues", label: "Indizi necessari per completarla", t: "refs", refTypes: ["clue"] },
      { k: "obstacles", label: "Ostacoli", t: "strings" },
      { k: "twists", label: "Svolte", t: "strings" },
      { k: "outcomes", label: "Possibili esiti", t: "list", fields: [
        { k: "label", label: "Esito", t: "string", req: true },
        { k: "description", label: "Descrizione", t: "text" },
        { k: "effects", label: "Conseguenze nel mondo", t: "list", fields: effectFields },
      ] },
      { k: "rewards", label: "Ricompense", t: "list", fields: [
        { k: "kind", label: "Tipo", t: "enum", opts: ["oro", "oggetto", "xp", "favore", "informazione"], req: true },
        { k: "text", label: "Dettaglio", t: "string" },
        { k: "item", label: "Oggetto", t: "ref", refTypes: ["item"] },
      ] },
      { k: "consequences", label: "Conseguenze generali", t: "text" },
      { k: "status", label: "Stato", t: "enum", opts: ["non iniziata", "attiva", "completata", "fallita"], req: true, def: "non iniziata" },
      { k: "chosenOutcome", label: "Esito scelto", t: "string" },
    ],
  },
  clue: {
    label: "Indizio", plural: "Indizi",
    fields: [
      { k: "name", label: "Titolo", t: "string", req: true },
      { k: "text", label: "Cosa scoprono i giocatori", t: "text", req: true },
      { k: "foundAtLocation", label: "Si trova nel luogo", t: "ref", refTypes: ["location"] },
      { k: "foundWithNpc", label: "Lo fornisce il PNG", t: "ref", refTypes: ["npc"] },
      { k: "foundInItem", label: "Si trova nell'oggetto", t: "ref", refTypes: ["item"] },
      { k: "check", label: "Prova richiesta", t: "string" },
      { k: "requires", label: "Accessibile solo dopo", t: "refs", refTypes: ["quest", "event", "clue"] },
      { k: "mystery", label: "Mistero collegato", t: "ref", refTypes: ["mystery"] },
      { k: "truthful", label: "Indizio veritiero", t: "bool", def: true },
      { k: "debunkedBy", label: "Falsa pista smentita da", t: "ref", refTypes: ["clue"] },
    ],
  },
  mystery: {
    label: "Mistero", plural: "Misteri",
    fields: [
      { k: "name", label: "Titolo", t: "string", req: true },
      { k: "question", label: "Domanda dei giocatori", t: "text", req: true },
      { k: "solution", label: "Soluzione", t: "text", req: true },
      { k: "culprit", label: "Responsabile", t: "ref", refTypes: ["npc"] },
      { k: "clues", label: "Indizi veritieri", t: "refs", refTypes: ["clue"] },
      { k: "redHerrings", label: "False piste", t: "refs", refTypes: ["clue"] },
    ],
  },
  item: {
    label: "Oggetto", plural: "Oggetti",
    fields: [
      { k: "name", label: "Nome", t: "string", req: true },
      { k: "kind", label: "Tipo", t: "enum", opts: ["arma", "armatura", "magico", "consumabile", "documento", "tesoro", "altro"], req: true, def: "altro" },
      { k: "description", label: "Descrizione", t: "text" },
      { k: "value", label: "Valore", t: "string" },
      { k: "origin", label: "Origine (da dove arriva)", t: "ref", refTypes: ["quest", "location", "npc", "event"] },
      { k: "holder", label: "Posseduto da", t: "ref", refTypes: ["npc"] },
    ],
  },
  event: {
    label: "Evento", plural: "Eventi",
    fields: [
      { k: "name", label: "Titolo", t: "string", req: true },
      { k: "kind", label: "Tipo", t: "enum", opts: ["storico", "previsto", "imprevisto"], req: true, def: "previsto" },
      { k: "day", label: "Giorno di campagna (≤0 = passato)", t: "int", req: true, def: 0 },
      { k: "description", label: "Descrizione", t: "text" },
      { k: "location", label: "Luogo", t: "ref", refTypes: ["location"] },
      { k: "participants", label: "PNG presenti", t: "refs", refTypes: ["npc"] },
      { k: "requires", label: "Si verifica dopo", t: "refs", refTypes: ["quest", "event"] },
      { k: "requiresKnowledge", label: "I giocatori devono conoscere (indizi)", t: "refs", refTypes: ["clue"] },
      { k: "trigger", label: "Condizione di innesco", t: "string" },
      { k: "happened", label: "È accaduto", t: "bool" },
      { k: "effects", label: "Effetti sul mondo", t: "list", fields: effectFields },
    ],
  },
  session: {
    label: "Sessione", plural: "Sessioni",
    fields: [
      { k: "name", label: "Titolo", t: "string", req: true },
      { k: "number", label: "Numero", t: "int", min: 1, req: true, def: 1 },
      { k: "act", label: "Atto", t: "int", min: 1 },
      { k: "chapter", label: "Capitolo", t: "int", min: 1 },
      { k: "summary", label: "Riassunto", t: "text" },
      { k: "quests", label: "Missioni", t: "refs", refTypes: ["quest"] },
      { k: "events", label: "Eventi", t: "refs", refTypes: ["event"] },
      { k: "notes", label: "Note del DM", t: "text" },
      { k: "played", label: "Giocata", t: "bool" },
    ],
  },
  dungeon: {
    label: "Dungeon", plural: "Dungeon",
    fields: [
      { k: "name", label: "Nome", t: "string", req: true },
      { k: "location", label: "Luogo", t: "ref", refTypes: ["location"] },
      { k: "seed", label: "Seed", t: "string", req: true },
      { k: "partyLevel", label: "Livello del gruppo", t: "int", min: 1, max: 20 },
      { k: "width", label: "Larghezza (celle)", t: "int", min: 10, max: 80, req: true },
      { k: "height", label: "Altezza (celle)", t: "int", min: 10, max: 60, req: true },
      { k: "grid", label: "Griglia", t: "grid" },
      { k: "rooms", label: "Stanze", t: "list", fields: [
        { k: "id", label: "Id", t: "string", req: true },
        { k: "name", label: "Nome", t: "string", req: true },
        { k: "x", label: "x", t: "int", req: true }, { k: "y", label: "y", t: "int", req: true },
        { k: "w", label: "w", t: "int", req: true }, { k: "h", label: "h", t: "int", req: true },
        { k: "kind", label: "Tipo", t: "enum", opts: ["ingresso", "stanza", "trappola", "enigma", "segreta", "tesoro", "boss"], req: true },
        { k: "description", label: "Descrizione", t: "text" },
        { k: "trap", label: "Trappola", t: "string" },
        { k: "puzzle", label: "Enigma", t: "string" },
        { k: "secret", label: "Segreto", t: "string" },
        { k: "treasure", label: "Tesoro", t: "string" },
        { k: "environment", label: "Condizioni ambientali", t: "string" },
        { k: "encounter", label: "Incontro (JSON)", t: "json" },
        { k: "event", label: "Evento collegato", t: "ref", refTypes: ["event"] },
        { k: "clues", label: "Indizi collegati", t: "refs", refTypes: ["clue"] },
        { k: "notes", label: "Note", t: "text" },
      ] },
    ],
  },
};

export const CAMPAIGN_FIELDS = [
  { k: "title", label: "Titolo", t: "string", req: true },
  { k: "setting", label: "Ambientazione", t: "text" },
  { k: "tone", label: "Tono", t: "enum", opts: ["eroico", "cupo", "mistero", "avventuroso", "orrore gotico", "politico"], req: true, def: "eroico" },
  { k: "danger", label: "Livello di pericolo", t: "enum", opts: ["basso", "medio", "alto", "letale"], req: true, def: "medio" },
  { k: "players", label: "Numero di giocatori", t: "int", min: 1, max: 10, req: true, def: 4 },
  { k: "startLevel", label: "Livello iniziale", t: "int", min: 1, max: 20, req: true, def: 1 },
  { k: "endLevel", label: "Livello previsto alla conclusione", t: "int", min: 1, max: 20, req: true, def: 5 },
  { k: "sessions", label: "Durata indicativa (sessioni)", t: "int", min: 1, max: 200, req: true, def: 8 },
  { k: "premise", label: "Premessa", t: "text" },
  { k: "centralConflict", label: "Conflitto centrale", t: "text" },
  { k: "worldState", label: "Stato attuale del mondo", t: "text" },
  { k: "currentDay", label: "Giorno corrente della campagna", t: "int", def: 1 },
  { k: "seed", label: "Seed di generazione", t: "string" },
  { k: "rulesVersion", label: "Versione regole", t: "enum", opts: ["srd-5.2 (2024)"], def: "srd-5.2 (2024)" },
];

export class ValidationError extends Error {
  constructor(errors) {
    super("Dati non validi: " + errors.map((e) => `${e.path}: ${e.message}`).join("; "));
    this.name = "ValidationError";
    this.errors = errors;
  }
}

/**
 * Normalizza e valida `data` secondo `fields`. `resolveRef(id)` -> tipo dell'entità o null se inesistente.
 * Ritorna dati puliti (campi sconosciuti scartati, default applicati). Lancia ValidationError.
 */
export function validateAgainst(fields, data, resolveRef, basePath = "") {
  const errors = [];
  const out = {};
  const src = data && typeof data === "object" ? data : {};
  for (const f of fields) {
    const p = basePath + f.k;
    let v = src[f.k];
    const empty = v === undefined || v === null || v === "";
    if (empty) {
      if (f.def !== undefined) v = f.def;
      else if (f.req) { errors.push({ path: p, message: "campo obbligatorio" }); continue; }
      else {
        if (["strings", "refs", "list"].includes(f.t)) out[f.k] = [];
        else if (f.t === "bool") out[f.k] = false;
        else if (f.t === "ref") out[f.k] = null;
        continue;
      }
    }
    switch (f.t) {
      case "string": case "text":
        if (typeof v !== "string") { errors.push({ path: p, message: "deve essere testo" }); break; }
        if (v.length > 20000) { errors.push({ path: p, message: "testo troppo lungo" }); break; }
        out[f.k] = v; break;
      case "int": {
        const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
        if (!Number.isInteger(n)) { errors.push({ path: p, message: "deve essere un intero" }); break; }
        if (f.min !== undefined && n < f.min) { errors.push({ path: p, message: `minimo ${f.min}` }); break; }
        if (f.max !== undefined && n > f.max) { errors.push({ path: p, message: `massimo ${f.max}` }); break; }
        out[f.k] = n; break;
      }
      case "bool":
        out[f.k] = v === true || v === "true" || v === 1; break;
      case "enum":
        if (!f.opts.includes(v)) { errors.push({ path: p, message: `valore ammesso: ${f.opts.join(", ")}` }); break; }
        out[f.k] = v; break;
      case "ref": {
        if (typeof v !== "string") { errors.push({ path: p, message: "riferimento non valido" }); break; }
        const ty = resolveRef(v);
        if (!ty) errors.push({ path: p, message: `riferimento inesistente (${v})` });
        else if (f.refTypes && !f.refTypes.includes(ty)) errors.push({ path: p, message: `tipo ${ty} non ammesso (atteso ${f.refTypes.join("/")})` });
        else out[f.k] = v;
        break;
      }
      case "refs": {
        if (!Array.isArray(v)) { errors.push({ path: p, message: "deve essere una lista" }); break; }
        const ok = [];
        v.forEach((id, i) => {
          const ty = typeof id === "string" ? resolveRef(id) : null;
          if (!ty) errors.push({ path: `${p}[${i}]`, message: `riferimento inesistente (${id})` });
          else if (f.refTypes && !f.refTypes.includes(ty)) errors.push({ path: `${p}[${i}]`, message: `tipo ${ty} non ammesso` });
          else if (!ok.includes(id)) ok.push(id);
        });
        out[f.k] = ok; break;
      }
      case "strings":
        if (!Array.isArray(v) || v.some((s) => typeof s !== "string")) { errors.push({ path: p, message: "deve essere una lista di testi" }); break; }
        out[f.k] = v.map((s) => s.trim()).filter(Boolean); break;
      case "list": {
        if (!Array.isArray(v)) { errors.push({ path: p, message: "deve essere una lista" }); break; }
        if (f.max && v.length > f.max) { errors.push({ path: p, message: `massimo ${f.max} elementi` }); break; }
        const items = [];
        v.forEach((item, i) => {
          try { items.push(validateAgainst(f.fields, item, resolveRef, `${p}[${i}].`)); }
          catch (e) { if (e instanceof ValidationError) errors.push(...e.errors); else throw e; }
        });
        out[f.k] = items; break;
      }
      case "grid":
        if (!Array.isArray(v) || v.some((r) => typeof r !== "string")) { errors.push({ path: p, message: "griglia non valida" }); break; }
        out[f.k] = v; break;
      case "json":
        if (typeof v === "object") out[f.k] = v; else errors.push({ path: p, message: "oggetto JSON atteso" });
        break;
      default:
        errors.push({ path: p, message: `tipo di campo sconosciuto ${f.t}` });
    }
  }
  if (errors.length) throw new ValidationError(errors);
  return out;
}

/** Elenca (campo, id) di tutti i riferimenti presenti in dati già validati: base per relazioni e grafo. */
export function extractRefs(fields, data, basePath = "") {
  const refs = [];
  for (const f of fields) {
    const v = data?.[f.k];
    if (v == null) continue;
    if (f.t === "ref" && v) refs.push({ field: basePath + f.k, id: v });
    else if (f.t === "refs") v.forEach((id) => refs.push({ field: basePath + f.k, id }));
    else if (f.t === "list") v.forEach((it) => refs.push(...extractRefs(f.fields, it, basePath + f.k + ".")));
  }
  return refs;
}

/** Testo ricercabile: solo i valori leggibili (testi ed enum), mai chiavi JSON né id di riferimento. Minuscolo. */
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

export function schemaForClient() {
  return { version: SCHEMA_VERSION, entityTypes: ENTITY_TYPES, campaignFields: CAMPAIGN_FIELDS };
}
