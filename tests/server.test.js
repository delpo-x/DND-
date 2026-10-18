// Test end-to-end: server HTTP reale su porta casuale, database su file temporaneo, riapertura inclusa.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { createApp } from "../src/server.js";
import { tmpDir } from "./helpers.js";

const dir = tmpDir("dcs-srv-");
const dbFile = path.join(dir, "studio.sqlite");
const backupDir = path.join(dir, "backups");
let app, base;

async function start(opts = {}) {
  app = createApp({ dbFile, backupDir, ...opts });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${app.server.address().port}`;
}
async function stop() {
  app.server.closeAllConnections?.();
  await new Promise((r) => app.server.close(r));
}
const call = async (method, url, body, headers = {}) => {
  const r = await fetch(base + url, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text, headers: r.headers };
};

before(() => start());
after(() => stop());

test("server: stato, schema e pagina statica serviti", async () => {
  const st = await call("GET", "/api/status");
  assert.equal(st.status, 200);
  const sc = await call("GET", "/api/schema");
  assert.ok(sc.json.entityTypes.quest);
  const home = await call("GET", "/");
  assert.equal(home.status, 200);
  assert.match(home.text, /<html/i);
  for (const f of ["/app.js", "/lib.js", "/style.css"]) assert.equal((await call("GET", f)).status, 200, f);
  assert.equal((await call("GET", "/../package.json")).status === 200, false, "no path traversal");
  assert.equal((await call("GET", "/api/inesistente")).status, 404);
});

test("server: flusso completo — genera, modifica, collega, controlla, esporta, backup, elimina, ripristina, riapri", async () => {
  const c = await call("POST", "/api/campaigns", { generate: true, params: { seed: "e2e" } });
  assert.ok([200, 201].includes(c.status), c.text);
  const cid = c.json.campaign.id;
  const title = c.json.campaign.title;
  assert.ok(cid, c.text.slice(0, 200));

  const list = (await call("GET", `/api/campaigns/${cid}/entities?type=npc`)).json;
  assert.ok(list.length >= 6);
  const npc = list[0];
  const upd = await call("PUT", `/api/entities/${npc.id}`, { data: { role: "Ruolo modificato" }, expectedVersion: npc.version });
  assert.equal(upd.json.data.role, "Ruolo modificato");
  assert.equal((await call("PUT", `/api/entities/${npc.id}`, { data: { role: "x" }, expectedVersion: 1 })).status, 409, "conflitto di versione");
  assert.equal((await call("PUT", `/api/entities/${npc.id}`, { data: { status: "immortale" } })).status, 422, "validazione");

  const bad = await call("POST", `/api/campaigns/${cid}/entities`, { type: "npc", data: { name: "X", location: "loc_nonesiste" } });
  assert.equal(bad.status, 422);
  assert.ok(Array.isArray(bad.json.validation));

  const check = (await call("GET", `/api/campaigns/${cid}/check`)).json;
  assert.equal(check.summary.errore, 0);
  const graph = (await call("GET", `/api/campaigns/${cid}/graph`)).json;
  assert.ok(graph.edges.length > 20);

  const md = await call("GET", `/api/campaigns/${cid}/export?format=md`);
  assert.equal(md.status, 200);
  assert.ok(md.text.includes(title));
  assert.match(md.text, /CC BY 4\.0|SRD/);
  const html = await call("GET", `/api/campaigns/${cid}/export?format=html`);
  assert.match(html.text, /<html/i);
  const js = await call("GET", `/api/campaigns/${cid}/export?format=json`);
  assert.equal(JSON.parse(js.text).format, "dnd-campaign-studio/campaign");

  const bk = await call("POST", `/api/campaigns/${cid}/backup`);
  assert.equal(bk.status, 201);
  assert.equal((await call("DELETE", `/api/campaigns/${cid}`, { confirmTitle: "sbagliato" })).status, 409);
  assert.equal((await call("DELETE", `/api/campaigns/${cid}`, { confirmTitle: title })).status, 200);
  assert.equal((await call("GET", "/api/campaigns")).json.length, 0);

  const rs = await call("POST", "/api/backups/restore", { file: bk.json.file });
  assert.equal(rs.status, 200);

  // chiusura e riapertura del processo: i dati devono esserci ancora
  await stop();
  await start();
  const after = (await call("GET", "/api/campaigns")).json;
  assert.equal(after.length, 1);
  assert.equal(after[0].title, title);
  const again = (await call("GET", `/api/campaigns/${cid}/entities?type=npc`)).json;
  assert.equal(again.find((n) => n.id === npc.id).data.role, "Ruolo modificato");
});

test("server: importazione di un'esportazione JSON e rifiuto di file corrotti", async () => {
  const cid = (await call("GET", "/api/campaigns")).json[0].id;
  const payload = JSON.parse((await call("GET", `/api/campaigns/${cid}/export?format=json`)).text);
  const imp = await call("POST", "/api/import", { payload });
  assert.equal(imp.status, 201);
  assert.notEqual(imp.json.id, cid);
  payload.entities[0].data.name = "manomesso";
  assert.equal((await call("POST", "/api/import", { payload })).status, 422);
});

test("server: generazione di PNG/evento/luogo/dungeon e anteprima dungeon deterministica", async () => {
  const cid = (await call("GET", "/api/campaigns")).json[0].id;
  for (const kind of ["npc", "event", "location", "dungeon"]) {
    const r = await call("POST", `/api/campaigns/${cid}/generate`, { kind, seed: "k1" });
    assert.equal(r.status, 201, `${kind}: ${r.text.slice(0, 200)}`);
  }
  assert.equal((await call("POST", `/api/campaigns/${cid}/generate`, { kind: "boh" })).status, 400);
  const a = await call("POST", "/api/dungeon/preview", { seed: "pp" }), b = await call("POST", "/api/dungeon/preview", { seed: "pp" });
  assert.deepEqual(a.json, b.json);
});

test("server: rigenerazione deterministica di un campo; Ollama spento => errore esplicito e dato invariato", async () => {
  const cid = (await call("GET", "/api/campaigns")).json[0].id;
  const npc = (await call("GET", `/api/campaigns/${cid}/entities?type=npc`)).json[0];
  const ok = await call("POST", `/api/entities/${npc.id}/regenerate`, { field: "personality", seed: 3 });
  assert.equal(ok.status, 200);
  await call("PUT", "/api/settings/ai", { provider: "ollama", baseUrl: "http://127.0.0.1:1" });
  const cur = (await call("GET", `/api/entities/${npc.id}`)).json;
  const fail = await call("POST", `/api/entities/${npc.id}/regenerate`, { field: "personality" });
  assert.ok(fail.status >= 400);
  assert.match(fail.json.error, /Ollama/);
  const after = (await call("GET", `/api/entities/${npc.id}`)).json;
  assert.deepEqual(after.data, cur.data);
  assert.equal(after.version, cur.version);
  const st = await call("POST", "/api/ai/test");
  assert.equal(st.json.available, false);
  await call("PUT", "/api/settings/ai", { provider: "deterministic" });
  assert.equal((await call("PUT", "/api/settings/ai", { provider: "ollama", baseUrl: "http://example.com" })).status, 400);
});

test("server: difese — host/origine non locali rifiutati", async () => {
  const r = await new Promise((resolve) => {
    const req = http.request(base + "/api/status", { headers: { host: "evil.example.com" } }, (res) => { res.resume(); resolve(res.statusCode); });
    req.end();
  });
  assert.equal(r, 403);
  const cross = await call("POST", "/api/campaigns", { title: "x" }, { origin: "http://evil.example.com" });
  assert.equal(cross.status, 403);
});

test("server: regole — ricerca creature e incontro con budget", async () => {
  const q = await call("GET", "/api/rules/creatures?q=goblin");
  assert.ok(q.json.length >= 1);
  const e = await call("POST", "/api/rules/encounter", { level: 3, players: 4, difficulty: "moderata", seed: "z" });
  assert.equal(e.status, 200, e.text);
});
