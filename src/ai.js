// Interfaccia astratta per i generatori di testo + due implementazioni: deterministica e Ollama locale.
// L'IA scrive SOLO campi di testo; entità, relazioni, eventi e stato restano nella struttura dati verificabile.
import { regenerateField, regenerableFields } from "./gen-det.js";
import { ENTITY_TYPES } from "./schema.js";

export class AiError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export const DEFAULT_AI_SETTINGS = {
  provider: "deterministic", // deterministic | ollama
  baseUrl: "http://127.0.0.1:11434",
  model: "qwen2.5:3b",
  timeoutMs: 90000,
  numCtx: 4096, // limita la memoria usata dal modello
  numPredict: 400, // limita la lunghezza della risposta
  temperature: 0.7,
  maxPromptChars: 6000,
};

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

export function validateAiSettings(input) {
  const s = { ...DEFAULT_AI_SETTINGS, ...input };
  if (!["deterministic", "ollama"].includes(s.provider)) throw new AiError("config", "Provider non valido (deterministic|ollama)", 400);
  let url;
  try { url = new URL(s.baseUrl); } catch { throw new AiError("config", "URL di Ollama non valido", 400); }
  if (!["http:", "https:"].includes(url.protocol)) throw new AiError("config", "L'URL di Ollama deve essere http(s)", 400);
  if (!LOOPBACK.has(url.hostname) && process.env.ALLOW_REMOTE_OLLAMA !== "1")
    throw new AiError("config", "Per sicurezza sono ammessi solo indirizzi locali (localhost/127.0.0.1). Imposta ALLOW_REMOTE_OLLAMA=1 per consentirne altri.", 400);
  if (typeof s.model !== "string" || !s.model.trim()) throw new AiError("config", "Modello non specificato", 400);
  for (const [k, lo, hi] of [["timeoutMs", 1000, 600000], ["numCtx", 512, 32768], ["numPredict", 16, 4096], ["maxPromptChars", 500, 40000]])
    if (!Number.isInteger(s[k]) || s[k] < lo || s[k] > hi) throw new AiError("config", `${k} deve essere un intero tra ${lo} e ${hi}`, 400);
  if (typeof s.temperature !== "number" || s.temperature < 0 || s.temperature > 2) throw new AiError("config", "temperature deve essere tra 0 e 2", 400);
  s.baseUrl = url.origin;
  return s;
}

export class DeterministicProvider {
  id = "deterministic";
  async status() { return { provider: this.id, available: true, message: "Sempre disponibile: nessuna rete né IA richieste." }; }
  supports(type, field) { return regenerableFields().includes(`${type}.${field}`); }
  async writeField(entity, field, { seed }) {
    return regenerateField(entity, field, seed);
  }
}

export class OllamaProvider {
  id = "ollama";
  constructor(settings, fetchImpl = globalThis.fetch) {
    this.s = settings;
    this.fetch = fetchImpl;
  }
  async #call(path, init, timeoutMs) {
    let res;
    try {
      res = await this.fetch(this.s.baseUrl + path, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      if (e?.name === "TimeoutError" || e?.name === "AbortError") throw new AiError("timeout", `Ollama non ha risposto entro ${Math.round(timeoutMs / 1000)} s.`, 504);
      throw new AiError("unreachable", `Ollama non raggiungibile su ${this.s.baseUrl}. Avvia Ollama oppure usa la modalità deterministica. (${e?.cause?.code ?? e?.message})`, 503);
    }
    return res;
  }
  /** Stato: servizio raggiungibile + modello installato. Non lancia mai: restituisce lo stato. */
  async status() {
    const base = { provider: this.id, baseUrl: this.s.baseUrl, model: this.s.model };
    try {
      const res = await this.#call("/api/tags", { method: "GET" }, 3000);
      if (!res.ok) return { ...base, available: false, serviceUp: true, message: `Ollama ha risposto HTTP ${res.status}.` };
      const j = await res.json();
      const models = (j.models ?? []).map((m) => m.name);
      // Ollama risolve un nome senza tag come ":latest": solo questo (o il nome esatto) è davvero utilizzabile.
      const installed = models.some((m) => m === this.s.model || (!this.s.model.includes(":") && m === this.s.model + ":latest"));
      const similar = installed ? [] : models.filter((m) => m.split(":")[0] === this.s.model.split(":")[0]);
      return {
        ...base, serviceUp: true, models, modelInstalled: installed, available: installed,
        message: installed ? "Ollama attivo e modello disponibile."
          : similar.length ? `Il modello "${this.s.model}" non è installato, ma ci sono varianti: ${similar.join(", ")}. Indica il nome completo con il tag nelle impostazioni.`
          : `Ollama è attivo ma il modello "${this.s.model}" non è installato. Esegui: ollama pull ${this.s.model}`,
      };
    } catch (e) {
      return { ...base, available: false, serviceUp: false, message: e.message };
    }
  }
  supports(type, field) {
    const f = ENTITY_TYPES[type]?.fields.find((x) => x.k === field);
    return !!f && ["string", "text", "strings"].includes(f.t);
  }
  buildPrompt(entity, field, campaign) {
    const def = ENTITY_TYPES[entity.type];
    const f = def.fields.find((x) => x.k === field);
    // Contesto ridotto: solo dati testuali scalari dell'entità e della campagna (evita di superare la finestra di contesto).
    const compact = Object.fromEntries(Object.entries(entity.data).filter(([, v]) => typeof v === "string" || (Array.isArray(v) && v.every((x) => typeof x === "string"))));
    const ctx = JSON.stringify({ campagna: { titolo: campaign?.title, ambientazione: campaign?.setting, tono: campaign?.tone, premessa: campaign?.premise }, [def.label.toLowerCase()]: compact }).slice(0, this.s.maxPromptChars);
    return [
      "Sei un assistente per Dungeon Master di D&D. Scrivi in italiano, con stile evocativo ma conciso.",
      `Riscrivi SOLO il campo "${f.label}" dell'elemento indicato. Non inventare nuovi nomi propri di personaggi o luoghi e non contraddire i dati forniti.`,
      f.t === "strings" ? "Rispondi con un elemento per riga, senza numeri né elenchi puntati."
        : f.t === "string" ? "Rispondi con UNA SOLA riga breve (poche parole, come il valore attuale), senza frasi introduttive, titoli né markdown."
        : "Rispondi con un solo paragrafo di testo semplice, senza titoli né markdown.",
      "Mantieni lo stesso genere grammaticale e gli stessi nomi dei dati forniti.",
      entity.data[field] ? `Valore attuale del campo (da riscrivere in modo diverso ma con lunghezza simile): ${JSON.stringify(entity.data[field]).slice(0, 600)}` : null,
      `Dati (JSON, fonte di verità): ${ctx}`,
      `Nuovo testo per "${f.label}":`,
    ].join("\n\n");
  }
  async writeField(entity, field, { seed, campaign }) {
    if (!this.supports(entity.type, field)) throw new AiError("unsupported", `Il campo ${field} non è un campo di testo rigenerabile con l'IA.`, 400);
    const f = ENTITY_TYPES[entity.type].fields.find((x) => x.k === field);
    const res = await this.#call("/api/generate", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.s.model, prompt: this.buildPrompt(entity, field, campaign), stream: false, keep_alive: "2m",
        options: { num_ctx: this.s.numCtx, num_predict: f.t === "string" ? Math.min(this.s.numPredict, 60) : this.s.numPredict, temperature: this.s.temperature, ...(seed !== undefined && Number.isFinite(Number(seed)) ? { seed: Number(seed) } : {}) },
      }),
    }, this.s.timeoutMs);
    if (res.status === 404) throw new AiError("model-missing", `Modello "${this.s.model}" non trovato in Ollama. Esegui: ollama pull ${this.s.model}`, 424);
    if (!res.ok) throw new AiError("http", `Ollama ha risposto HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`, 502);
    let j;
    try { j = await res.json(); } catch { throw new AiError("bad-response", "Risposta di Ollama non interpretabile (JSON non valido).", 502); }
    if (j.error) throw new AiError("model-error", `Errore di Ollama: ${String(j.error).slice(0, 200)}`, 502);
    if (j.done === false) throw new AiError("incomplete", "Risposta incompleta da Ollama (generazione interrotta). Nessun dato è stato modificato.", 502);
    // Per i campi brevi il limite di token è voluto: si usa la prima riga, quindi la troncatura non è un errore.
    if (j.done_reason === "length" && f.t !== "string") throw new AiError("truncated", "Risposta troncata per il limite di lunghezza (numPredict). Nessun dato modificato: aumenta il limite o riprova.", 502);
    const text = cleanModelText(j.response);
    if (!text) throw new AiError("empty", "Ollama ha restituito una risposta vuota.", 502);
    if (f.t === "string") return text.split("\n").map((l) => l.trim()).find(Boolean).slice(0, 200);
    return f.t === "strings" ? text.split("\n").map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim()).filter(Boolean) : text;
  }
}

export function cleanModelText(s) {
  return String(s ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^```[a-z]*\n?|```$/gim, "").replace(/^["«]|["»]$/g, "").trim();
}

export function makeProvider(settings, fetchImpl) {
  return settings.provider === "ollama" ? new OllamaProvider(settings, fetchImpl) : new DeterministicProvider();
}
