// Ollama è testato contro un server HTTP finto (mock): NON contro un Ollama reale.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { OllamaProvider, DeterministicProvider, validateAiSettings, AiError, cleanModelText, DEFAULT_AI_SETTINGS } from "../src/ai.js";
import { memStore, genInto, ents } from "./helpers.js";

function mock(handler) {
  return new Promise((resolve) => {
    const srv = http.createServer(handler);
    srv.listen(0, "127.0.0.1", () => resolve({ srv, url: `http://127.0.0.1:${srv.address().port}`, close: () => srv.closeAllConnections?.() || srv.close() }));
  });
}
const settings = (url, extra = {}) => validateAiSettings({ provider: "ollama", baseUrl: url, ...extra });
const entity = (s, cid) => ents(s, cid, "npc")[0];

test("ollama: stato con modello installato, modello mancante e servizio spento", async () => {
  const m = await mock((req, res) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ models: [{ name: "qwen2.5:3b" }] })); });
  assert.equal((await new OllamaProvider(settings(m.url)).status()).available, true);
  const st = await new OllamaProvider(settings(m.url, { model: "altro" })).status();
  assert.equal(st.available, false);
  assert.match(st.message, /ollama pull altro/);
  m.close();
  const off = await new OllamaProvider(settings("http://127.0.0.1:1")).status();
  assert.equal(off.available, false);
  assert.equal(off.serviceUp, false);
});

test("ollama: risposta valida scrive testo ripulito; i limiti di memoria arrivano nelle opzioni", async () => {
  let seen;
  const m = await mock((req, res) => {
    let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
      seen = JSON.parse(b);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ response: "<think>x</think>Un uomo diffidente.", done: true, done_reason: "stop" }));
    });
  });
  const s = memStore(); const { campaignId } = genInto(s);
  const out = await new OllamaProvider(settings(m.url, { numCtx: 2048, numPredict: 123 })).writeField(entity(s, campaignId), "personality", { seed: 7, campaign: s.getCampaign(campaignId) });
  assert.equal(out, "Un uomo diffidente.");
  assert.equal(seen.stream, false);
  assert.equal(seen.options.num_ctx, 2048);
  assert.equal(seen.options.num_predict, 123);
  m.close();
});

const failCases = [
  ["incomplete", (res) => res.end(JSON.stringify({ response: "tronc", done: false }))],
  ["truncated", (res) => res.end(JSON.stringify({ response: "tronc", done: true, done_reason: "length" }))],
  ["empty", (res) => res.end(JSON.stringify({ response: "  ", done: true }))],
  ["bad-response", (res) => res.end("non json")],
  ["model-error", (res) => res.end(JSON.stringify({ error: "out of memory" }))],
  ["model-missing", (res) => { res.statusCode = 404; res.end("{}"); }],
  ["http", (res) => { res.statusCode = 500; res.end("boom"); }],
];
for (const [code, reply] of failCases) {
  test(`ollama: ${code} => AiError "${code}"`, async () => {
    const m = await mock((req, res) => { res.setHeader("content-type", "application/json"); reply(res); });
    const s = memStore(); const { campaignId } = genInto(s);
    await assert.rejects(new OllamaProvider(settings(m.url)).writeField(entity(s, campaignId), "personality", { seed: 1 }), (e) => e instanceof AiError && e.code === code);
    m.close();
  });
}

test("ollama: timeout e servizio spento sono errori espliciti", async () => {
  const m = await mock(() => {}); // non risponde mai
  const s = memStore(); const { campaignId } = genInto(s);
  await assert.rejects(new OllamaProvider({ ...settings(m.url), timeoutMs: 300 }).writeField(entity(s, campaignId), "personality", {}), (e) => e.code === "timeout");
  m.close();
  await assert.rejects(new OllamaProvider(settings("http://127.0.0.1:1")).writeField(entity(s, campaignId), "personality", {}), (e) => e.code === "unreachable");
});

test("ollama: campi non testuali non sono rigenerabili", async () => {
  const s = memStore(); const { campaignId } = genInto(s);
  const p = new OllamaProvider(settings("http://127.0.0.1:1"));
  assert.equal(p.supports("npc", "personality"), true);
  assert.equal(p.supports("npc", "location"), false);
  await assert.rejects(p.writeField(entity(s, campaignId), "location", {}), (e) => e.code === "unsupported");
});

test("impostazioni IA: solo indirizzi locali e limiti validi", () => {
  assert.throws(() => validateAiSettings({ baseUrl: "http://example.com:11434" }), /solo indirizzi locali/);
  assert.throws(() => validateAiSettings({ baseUrl: "ftp://127.0.0.1" }), /http/);
  assert.throws(() => validateAiSettings({ numCtx: 10 }), /numCtx/);
  assert.throws(() => validateAiSettings({ provider: "gpt" }), /Provider/);
  assert.equal(validateAiSettings({}).provider, DEFAULT_AI_SETTINGS.provider);
});

test("modalità deterministica: sempre disponibile e funziona senza rete", async () => {
  const p = new DeterministicProvider();
  assert.equal((await p.status()).available, true);
  const s = memStore(); const { campaignId } = genInto(s);
  const v = await p.writeField(entity(s, campaignId), "personality", { seed: 3 });
  assert.equal(typeof v, "string");
});

test("cleanModelText rimuove blocchi di ragionamento e recinti di codice", () => {
  assert.equal(cleanModelText("<think>a</think>\n```\nciao\n```"), "ciao");
});
