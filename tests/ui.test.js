// Test dell'interfaccia in un browser reale (Edge/Chrome headless) pilotato via Chrome DevTools Protocol.
// Nessuna dipendenza npm: usa il WebSocket globale di Node. Se non c'è un browser, i test sono SALTATI (non "superati").
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createApp } from "../src/server.js";
import { tmpDir } from "./helpers.js";

const CANDIDATES = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
];
const exe = process.env.BROWSER_EXE || CANDIDATES.find((p) => fs.existsSync(p));
const skip = exe ? false : "nessun browser Edge/Chrome trovato (imposta BROWSER_EXE)";

const dir = tmpDir("dcs-ui-");
let app, base, proc, ws, nextId = 1;
const pending = new Map();
const problems = [];
const dialogs = [];

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const ev = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error("JS: " + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
  return r.result.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(expr, what, ms = 8000) {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await ev(expr)) return; await sleep(100); }
  throw new Error("Timeout in attesa di: " + what);
}
const clickText = (sel, text) => ev(`(() => { const el=[...document.querySelectorAll(${JSON.stringify(sel)})].find(e=>e.textContent.trim().includes(${JSON.stringify(text)})); if(!el) return false; el.click(); return true; })()`);
const noErrorToast = () => ev(`!document.querySelector('.toast.err')`);

before(async () => {
  if (skip) return;
  app = createApp({ dbFile: path.join(dir, "ui.sqlite"), backupDir: path.join(dir, "b") });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${app.server.address().port}`;
  const profile = path.join(dir, "profile");
  proc = spawn(exe, ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  let portFile = path.join(profile, "DevToolsActivePort");
  for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await sleep(100);
  const [port] = fs.readFileSync(portFile, "utf8").split("\n");
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((t) => t.type === "page");
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.reject(new Error(d.error.message)) : p.resolve(d.result); }
    else if (d.method === "Runtime.exceptionThrown") problems.push("eccezione: " + (d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text));
    else if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") problems.push("console.error: " + d.params.args.map((a) => a.value ?? a.description).join(" "));
    else if (d.method === "Page.javascriptDialogOpening") dialogs.push(d.params);
    else if (d.method === "Log.entryAdded" && d.params.entry.level === "error") problems.push("log: " + d.params.entry.text + " " + (d.params.entry.url ?? ""));
  };
  await send("Runtime.enable"); await send("Log.enable"); await send("Page.enable");
  await send("Page.navigate", { url: base + "/" });
});
after(async () => {
  try { ws?.close(); } catch { /* */ }
  if (proc) { proc.kill(); await sleep(300); }
  if (app) { app.server.closeAllConnections?.(); await new Promise((r) => app.server.close(r)); }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* il browser può tenere il profilo ancora un attimo */ }
});

test("UI: la home carica in italiano e l'indicatore IA è visibile", { skip }, async () => {
  await waitFor(`document.querySelector('#main h1')`, "titolo home");
  assert.match(await ev(`document.title`), /Campaign Studio/);
  await waitFor(`/IA/.test(document.getElementById('ai-badge').textContent) && !/…/.test(document.getElementById('ai-badge').textContent)`, "stato IA");
  assert.match(await ev(`document.getElementById('ai-badge').textContent`), /determinist/i);
});

test("UI: creazione di una campagna generata dalla finestra di dialogo", { skip }, async () => {
  assert.ok(await clickText("button", "Nuova campagna"));
  await waitFor(`document.querySelector('.modal')`, "finestra nuova campagna");
  assert.ok(await ev(`(() => { const i=document.querySelector('.modal input[type=text]'); i.value='Campagna UI'; return true; })()`));
  assert.ok(await clickText(".modal button", "Crea"));
  await waitFor(`location.hash.includes('/panoramica')`, "apertura campagna");
  await waitFor(`document.querySelector('#sidebar a')`, "menu laterale");
  assert.ok(await noErrorToast());
});

test("UI: ogni sezione del menu si apre senza errori e mostra contenuto", { skip }, async () => {
  const links = await ev(`[...document.querySelectorAll('#sidebar a')].map(a => a.getAttribute('href'))`);
  assert.ok(links.length >= 17, "link: " + links.length);
  for (const href of links) {
    await ev(`location.hash = ${JSON.stringify(href)}`);
    await sleep(350);
    const info = await ev(`({ h1: document.querySelector('#main h1')?.textContent ?? '', len: document.getElementById('main').innerText.length, err: !!document.querySelector('.toast.err') })`);
    assert.ok(info.h1.length > 0 && (info.len > 30 || href.endsWith("/cestino")) && !info.err, `${href}: ${JSON.stringify(info)}`);
  }
});

test("UI: creazione, modifica ed eliminazione (cestino) di un PNG dai moduli", { skip }, async () => {
  const cid = await ev(`location.hash.split('/')[2]`);
  await ev(`location.hash = '#/c/' + ${JSON.stringify(cid)} + '/npc'`);
  await waitFor(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('Aggiungi'))`, "pulsante aggiungi");
  assert.ok(await clickText("button", "Aggiungi"));
  await waitFor(`document.querySelector('.modal input[type=text]')`, "modulo PNG");
  await ev(`(() => { const i=document.querySelector('.modal input[type=text]'); i.value='Zibaldo il Provato'; })()`);
  assert.ok(await clickText(".modal button", "Crea"));
  await waitFor(`document.querySelector('#main h1')?.textContent.includes('Zibaldo')`, "dettaglio PNG creato");
  // modifica: cambio ruolo
  const changed = await ev(`(() => { const f=document.querySelector('[data-field=role] input'); if(!f) return false; f.value='Cartografo'; return true; })()`);
  assert.ok(changed, "campo ruolo");
  assert.ok(await clickText("button", "Salva"));
  await waitFor(`document.querySelector('.toast.ok') && /versione 2/.test(document.getElementById('main').innerText)`, "salvataggio versione 2");
  // eliminazione nel cestino (con conferma)
  assert.ok(await clickText("button", "Elimina"));
  await waitFor(`document.querySelector('.modal')`, "conferma");
  assert.ok(await clickText(".modal button", "Sposta nel cestino"));
  await waitFor(`location.hash.endsWith('/npc') && !document.getElementById('main').innerText.includes('Zibaldo')`, "PNG fuori dall'elenco");
  await ev(`location.hash = '#/c/' + ${JSON.stringify(cid)} + '/cestino'`);
  await waitFor(`document.getElementById('main').innerText.includes('Zibaldo')`, "PNG nel cestino");
});

test("UI: un elemento ancora usato non può essere eliminato (messaggio con i riferimenti)", { skip }, async () => {
  const cid = await ev(`location.hash.split('/')[2]`);
  await ev(`location.hash = '#/c/' + ${JSON.stringify(cid)} + '/location'`);
  await waitFor(`document.querySelector('#main table tr.clickable, #main .card a, #main a[href*="/location/"]')`, "elenco luoghi");
  await ev(`(document.querySelector('#main tr.clickable') ?? document.querySelector('#main a[href*="/location/loc_"]')).click()`);
  await waitFor(`/versione/.test(document.getElementById('main').innerText)`, "dettaglio luogo");
  assert.ok(await clickText("button", "Elimina"));
  await waitFor(`document.querySelector('.modal')`, "finestra");
  assert.match(await ev(`document.querySelector('.modal h2').textContent`), /Impossibile eliminare/);
  assert.ok(await ev(`!!document.querySelector('.modal li')`), "elenco dei riferimenti");
});

test("UI: controllo di coerenza visibile e nessun errore JS durante tutta la sessione", { skip }, async () => {
  const cid = await ev(`location.hash.split('/')[2]`);
  await ev(`location.hash = '#/c/' + ${JSON.stringify(cid)} + '/coerenza'`);
  await waitFor(`/Errori|errori/.test(document.getElementById('main').innerText)`, "pagina coerenza");
  assert.deepEqual(problems, [], "problemi JS/console:\n" + problems.join("\n"));
});

test("UI: tracker di combattimento — aggiungi, ordina, danno, turno, e i dati restano dopo il ricaricamento", { skip }, async () => {
  const cid = await ev(`location.hash.split('/')[2]`);
  await ev(`location.hash = '#/c/' + ${JSON.stringify(cid)} + '/tracker'`);
  await waitFor(`[...document.querySelectorAll('button')].some(b => b.textContent === 'Aggiungi')`, "tracker");
  const addOne = async (name, ini, hp) => {
    await ev(`(() => { const t=[...document.querySelectorAll('#main .toolbar')].find(x => [...x.querySelectorAll('button')].some(b => b.textContent==='Aggiungi')); const inp=t.querySelectorAll('input'); inp[0].value=${JSON.stringify(name)}; inp[1].value=${ini}; inp[2].value=${hp}; inp[3].value=${hp}; })()`);
    assert.ok(await clickText("button", "Aggiungi"));
    await waitFor(`document.getElementById('main').innerText.includes(${JSON.stringify(name)})`, name);
  };
  await addOne("Ragno Gigante", 8, 26);
  // regressione: una seconda scheda con stato vecchio non sovrascrive il tracker (409 => ricarica e avviso)
  const rev = await ev(`fetch('/api/campaigns/${cid}/tracker').then(r => r.json()).then(t => t.rev)`);
  const stale = await ev(`fetch('/api/campaigns/${cid}/tracker', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ round: 1, turn: 0, combatants: [], expectedRev: ${rev} - 1 }) }).then(r => r.status)`);
  assert.equal(stale, 409);
  await sleep(100);
  const i409 = problems.findIndex((p) => /409 \(Conflict\).*\/tracker$/.test(p)); // il browser registra il 409 provocato apposta
  if (i409 >= 0) problems.splice(i409, 1);
  await addOne("Elora", 18, 30);
  assert.ok(await clickText("button", "Ordina per iniziativa"));
  await waitFor(`document.querySelector('#main tbody tr strong')?.textContent === 'Elora'`, "ordine");
  assert.ok(await ev(`(() => { const r=[...document.querySelectorAll('#main tbody tr')].find(r => r.innerText.includes('Ragno')); r.querySelector('input[type=number][min="0"]').value=10; [...r.querySelectorAll('button')].find(b => b.textContent==='Danno').click(); return true; })()`));
  await waitFor(`document.getElementById('main').innerText.includes('16 / 26')`, "PF scesi a 16");
  assert.ok(await clickText("button", "Prossimo turno"));
  await waitFor(`document.querySelector('#main tr.turn')?.innerText.includes('Ragno')`, "turno al ragno");
  await ev(`window.__oldPage = true; location.reload()`);
  await waitFor(`!window.__oldPage && document.getElementById('main').innerText.includes('16 / 26')`, "stato dopo il ricaricamento");
  assert.ok(await noErrorToast());
  assert.deepEqual(problems, [], "problemi JS/console: " + problems.join(" | "));
});

test("UI: editor del dungeon — si apre con la mappa completa, il disegno modifica la griglia e attiva l'avviso di modifiche", { skip }, async () => {
  const cid = await ev(`location.hash.split('/')[2]`);
  const dun = await ev(`fetch('/api/campaigns/${cid}/entities?type=dungeon').then(r => r.json()).then(l => ({ id: l[0].id, name: l[0].data.name, w: l[0].data.width, h: l[0].data.height }))`);
  await ev(`location.hash = '#/c/' + ${JSON.stringify(cid)} + '/dungeon/' + ${JSON.stringify(dun.id)}`);
  await waitFor(`document.querySelector('#main h1')?.textContent === ${JSON.stringify(dun.name)} && document.querySelectorAll('#main .map-wrap svg rect').length > 0`, "editor del dungeon");
  assert.equal(await ev(`document.querySelectorAll('#main .map-wrap svg rect').length`), dun.w * dun.h, "una casella per cella");
  // strumento "Porta" e clic su una casella di muro
  await ev(`document.querySelector('#main input[name=tool][value="+"]').click()`);
  const before = await ev(`document.querySelectorAll('#main .map-wrap svg rect[fill="#8a5a2b"]').length`);
  await ev(`(() => { const r = [...document.querySelectorAll('#main .map-wrap svg rect')].find(x => x.getAttribute('fill') === '#1d1a16'); r.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, buttons: 1 })); })()`);
  assert.equal(await ev(`document.querySelectorAll('#main .map-wrap svg rect[fill="#8a5a2b"]').length`), before + 1, "una porta in più");
  await ev(`[...document.querySelectorAll('#sidebar a')].find(a => a.getAttribute('href').endsWith('/npc')).click()`);
  await waitFor(`document.querySelector('.modal h2')?.textContent === 'Modifiche non salvate'`, "avviso dopo il disegno");
  assert.ok(await clickText(".modal button", "Esci senza salvare"));
  await waitFor(`location.hash.endsWith('/npc') && !document.querySelector('.modal')`, "uscita");
  assert.deepEqual(problems, [], "problemi JS/console: " + problems.join(" | "));
});

test("UI: grafo delle relazioni — il filtro per nome mostra solo gli elementi trovati e i loro collegamenti", { skip }, async () => {
  const cid = await ev(`location.hash.split('/')[2]`);
  await ev(`location.hash = '#/c/' + ${JSON.stringify(cid)} + '/relazioni'`);
  await waitFor(`!!document.querySelector('#main svg circle')`, "grafo disegnato");
  const count = () => ev(`Number((document.querySelector('#main p.muted')?.textContent.match(/^(\\d+) elementi/) ?? [])[1] ?? -1)`);
  const all = await count();
  const name = await ev(`fetch('/api/campaigns/${cid}/entities?type=npc').then(r => r.json()).then(l => l[0].data.name)`);
  await ev(`(() => { const q = document.querySelector('#main input[type=search]'); q.value = ${JSON.stringify(name)}; q.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await waitFor(`(() => { const m = document.querySelector('#main p.muted')?.textContent.match(/^(\\d+) elementi/); return m && Number(m[1]) < ${all}; })()`, "grafo filtrato");
  const filtered = await count();
  assert.ok(filtered >= 1 && filtered < all, `${filtered} su ${all}`);
  assert.ok(await ev(`[...document.querySelectorAll('#main svg text')].some(t => ${JSON.stringify(name)}.startsWith(t.textContent.replace('…', '')))`), "l'elemento cercato è nel grafo");
  assert.deepEqual(problems, [], "problemi JS/console: " + problems.join(" | "));
});

test("UI: una vista lenta non copre la sezione aperta subito dopo (navigazioni sovrapposte)", { skip }, async () => {
  const cid = await ev(`location.hash.split('/')[2]`);
  await ev(`location.hash = '#/c/' + ${JSON.stringify(cid)} + '/coerenza'`);
  await waitFor(`/Coerenza narrativa/.test(document.querySelector('#main h1')?.textContent ?? '')`, "pagina coerenza");
  // rallenta solo la richiesta di cui ha bisogno "Esporta"
  await ev(`(() => { window.__realFetch = window.fetch; window.fetch = (u, o) => String(u).includes('/api/backups') ? new Promise((r) => setTimeout(r, 1500)).then(() => window.__realFetch(u, o)) : window.__realFetch(u, o); })()`);
  try {
    await ev(`location.hash = '#/c/' + ${JSON.stringify(cid)} + '/esporta'`);
    await sleep(150);
    await ev(`location.hash = '#/c/' + ${JSON.stringify(cid)} + '/npc'`);
    await waitFor(`/PNG/.test(document.querySelector('#main h1')?.textContent ?? '')`, "elenco PNG");
    await sleep(2000); // la vista "Esporta" finisce adesso
    assert.match(await ev(`document.querySelector('#main h1').textContent`), /PNG/, "resta la sezione aperta per ultima");
    assert.match(await ev(`location.hash`), /\/npc$/);
  } finally {
    await ev(`window.fetch = window.__realFetch`);
  }
  assert.deepEqual(problems, [], "problemi JS/console: " + problems.join(" | "));
});

const drop409 = async () => { await sleep(150); for (let i = problems.length - 1; i >= 0; i--) if (/409 \(Conflict\).*\/tracker$/.test(problems[i])) problems.splice(i, 1); };

test("UI: tracker modificato in un'altra scheda — il salvataggio da stato vecchio non sovrascrive, ricarica e avvisa", { skip }, async () => {
  const cid = await ev(`location.hash.split('/')[2]`);
  await ev(`location.hash = '#/c/' + ${JSON.stringify(cid)} + '/tracker'`);
  await waitFor(`document.getElementById('main').innerText.includes('Ragno Gigante')`, "tracker con lo stato precedente");
  // "altra scheda": modifica il tracker direttamente sul server con la revisione corrente
  const ok = await ev(`fetch('/api/campaigns/${cid}/tracker').then(r => r.json()).then(t => fetch('/api/campaigns/${cid}/tracker', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...t, combatants: [...t.combatants, { name: 'Intruso', initiative: 3, hp: 4, maxHp: 4 }], expectedRev: t.rev }) })).then(r => r.status)`);
  assert.equal(ok, 200);
  assert.ok(!(await ev(`document.getElementById('main').innerText.includes('Intruso')`)), "questa scheda ha ancora lo stato vecchio");
  await ev(`(() => { const t=[...document.querySelectorAll('#main .toolbar')].find(x => [...x.querySelectorAll('button')].some(b => b.textContent==='Aggiungi')); const inp=t.querySelectorAll('input'); inp[0].value='Tardivo'; inp[1].value=5; inp[2].value=6; inp[3].value=6; })()`);
  assert.ok(await clickText("button", "Aggiungi"));
  await waitFor(`/altra scheda/.test(document.querySelector('.toast.err')?.textContent ?? '')`, "avviso di conflitto");
  await waitFor(`document.getElementById('main').innerText.includes('Intruso')`, "stato ricaricato dal server");
  assert.ok(!(await ev(`document.getElementById('main').innerText.includes('Tardivo')`)), "la modifica da stato vecchio non è stata applicata");
  const names = await ev(`fetch('/api/campaigns/${cid}/tracker').then(r => r.json()).then(t => t.combatants.map(c => c.name))`);
  assert.ok(names.includes("Intruso") && names.includes("Ragno Gigante") && !names.includes("Tardivo"), JSON.stringify(names));
  await drop409();
  // ripetendo l'aggiunta dopo il ricaricamento, va a buon fine
  await ev(`(() => { const t=[...document.querySelectorAll('#main .toolbar')].find(x => [...x.querySelectorAll('button')].some(b => b.textContent==='Aggiungi')); const inp=t.querySelectorAll('input'); inp[0].value='Tardivo'; inp[1].value=5; inp[2].value=6; inp[3].value=6; })()`);
  assert.ok(await clickText("button", "Aggiungi"));
  await waitFor(`document.getElementById('main').innerText.includes('Tardivo')`, "aggiunta ripetuta");
  assert.deepEqual(problems, [], "problemi JS/console: " + problems.join(" | "));
});

test("UI: chiudere o ricaricare la scheda con modifiche non salvate chiede conferma (beforeunload)", { skip }, async () => {
  const cid = await ev(`location.hash.split('/')[2]`);
  await ev(`location.hash = '#/c/' + ${JSON.stringify(cid)} + '/panoramica'`);
  await waitFor(`/Dati della campagna/.test(document.getElementById('main').innerText) && document.querySelector('#main .form textarea')`, "modulo campagna");
  // senza modifiche: il ricaricamento non chiede nulla
  dialogs.length = 0;
  await ev(`window.__oldPage = true`); // si attende la pagina nuova, non quella ancora visibile prima del ricaricamento
  await send("Page.reload");
  await waitFor(`!window.__oldPage && /Dati della campagna/.test(document.getElementById('main')?.innerText ?? '') && document.querySelector('#main .form textarea')`, "pagina ricaricata");
  assert.equal(dialogs.length, 0, "nessuna richiesta senza modifiche");
  // modifica con input reale (mouse + tastiera) perché il browser mostra beforeunload solo dopo un'interazione dell'utente
  const r = await ev(`(() => { const f=document.querySelector('#main .form textarea'); f.scrollIntoView({ block: 'center' }); const b=f.getBoundingClientRect(); return { x: b.x + 10, y: b.y + 10 }; })()`);
  for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x: r.x, y: r.y, button: "left", clickCount: 1 });
  await send("Input.insertText", { text: " bozza-scheda" });
  assert.match(await ev(`document.querySelector('#main .form textarea').value`), /bozza-scheda/);
  send("Page.reload").catch(() => { /* risponde solo dopo la scelta */ });
  const t = Date.now();
  while (!dialogs.length && Date.now() - t < 5000) await sleep(100);
  assert.equal(dialogs[0]?.type, "beforeunload", "richiesta di conferma del browser");
  await send("Page.handleJavaScriptDialog", { accept: false });
  await sleep(300);
  assert.match(await ev(`document.querySelector('#main .form textarea').value`), /bozza-scheda/, "rifiutando si resta sulla pagina con la bozza");
  // accettando, la pagina si ricarica e la bozza non viene salvata
  send("Page.reload").catch(() => { /* */ });
  const t2 = Date.now();
  while (dialogs.length < 2 && Date.now() - t2 < 5000) await sleep(100);
  assert.equal(dialogs[1]?.type, "beforeunload");
  await send("Page.handleJavaScriptDialog", { accept: true });
  await waitFor(`!window.__oldPage && /Dati della campagna/.test(document.getElementById('main')?.innerText ?? '') && document.querySelector('#main .form textarea')`, "pagina ricaricata dopo conferma");
  assert.doesNotMatch(await ev(`document.querySelector('#main .form textarea').value`), /bozza-scheda/);
  assert.deepEqual(problems, [], "problemi JS/console: " + problems.join(" | "));
});

test("UI: uscire da un modulo con modifiche non salvate chiede conferma; Annulla resta sulla pagina", { skip }, async () => {
  const cid = await ev(`location.hash.split('/')[2]`);
  await ev(`location.hash = '#/c/' + ${JSON.stringify(cid)} + '/panoramica'`);
  await waitFor(`/Dati della campagna/.test(document.getElementById('main').innerText) && document.querySelector('#main .form textarea, #main .form input[type=text]')`, "modulo campagna");
  await ev(`(() => { const f=document.querySelector('#main .form textarea, #main .form input[type=text]'); f.value='Bozza non salvata'; f.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await ev(`[...document.querySelectorAll('#sidebar a')].find(a => a.getAttribute('href').endsWith('/npc')).click()`);
  await waitFor(`document.querySelector('.modal h2')?.textContent === 'Modifiche non salvate'`, "avviso modifiche non salvate");
  assert.match(await ev(`location.hash`), /\/panoramica$/, "l'indirizzo resta sulla pagina finché non si decide");
  assert.ok(await clickText(".modal button", "Annulla"));
  await sleep(300);
  assert.match(await ev(`location.hash`), /\/panoramica$/);
  assert.equal(await ev(`document.querySelector('#main .form textarea, #main .form input[type=text]').value`), "Bozza non salvata", "la bozza è ancora lì");
  await ev(`[...document.querySelectorAll('#sidebar a')].find(a => a.getAttribute('href').endsWith('/npc')).click()`);
  await waitFor(`document.querySelector('.modal h2')?.textContent === 'Modifiche non salvate'`, "secondo avviso");
  assert.ok(await clickText(".modal button", "Esci senza salvare"));
  await waitFor(`location.hash.endsWith('/npc') && !document.querySelector('.modal')`, "uscita confermata");
  const saved = await ev(`fetch('/api/campaigns/${cid}').then(r => r.json()).then(c => JSON.stringify(c))`);
  assert.ok(!saved.includes("Bozza non salvata"), "nulla salvato");
  assert.deepEqual(problems, [], "problemi JS/console: " + problems.join(" | "));
});

// ---------------- funzioni aggiunte: ricaricamento ridotto, unione dei conflitti, dialoghi protetti, annulla rigenerazione, al tavolo ----------------
const dropConflicts = async () => { await sleep(150); for (let i = problems.length - 1; i >= 0; i--) if (/409 \(Conflict\)/.test(problems[i])) problems.splice(i, 1); };
const top = (sel) => `#modal-root > .modal-bg:last-child ${sel}`;
const entityRequests = () => ev(`performance.getEntriesByType('resource').filter(r => /\\/api\\/campaigns\\/[^/]+\\/entities/.test(r.name)).length`);

test("UI: navigando senza modifiche gli elementi non si riscaricano; dopo una modifica esterna sì", { skip }, async () => {
  const cid = await ev(`location.hash.split('/')[2]`);
  await ev(`location.hash = '#/c/' + ${JSON.stringify(cid)} + '/npc'`);
  await waitFor(`/PNG/.test(document.querySelector('#main h1')?.textContent ?? '')`, "elenco PNG");
  await ev(`performance.clearResourceTimings()`);
  for (const sec of ["quest", "location", "panoramica", "npc"]) {
    await ev(`location.hash = '#/c/' + ${JSON.stringify(cid)} + '/${sec}'`);
    await sleep(250);
  }
  assert.equal(await entityRequests(), 0, "nessun riscaricamento degli elementi senza modifiche");
  // "altra scheda": crea un PNG direttamente sul server
  const st = await ev(`fetch('/api/campaigns/${cid}/entities', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'npc', data: { name: 'Esterno Ottavio', status: 'vivo' } }) }).then(r => r.status)`);
  assert.equal(st, 201);
  await ev(`location.hash = '#/c/' + ${JSON.stringify(cid)} + '/quest'`);
  await sleep(250);
  await ev(`location.hash = '#/c/' + ${JSON.stringify(cid)} + '/npc'`);
  await waitFor(`document.getElementById('main').innerText.includes('Esterno Ottavio')`, "nuovo PNG visibile");
  assert.ok(await entityRequests() >= 1, "campagna cambiata: elementi riscaricati");
  assert.deepEqual(problems, [], "problemi JS/console: " + problems.join(" | "));
});

test("UI: modificato in un'altra scheda — campi diversi si uniscono, stesso campo si sceglie, Annulla conserva la bozza", { skip }, async () => {
  const cid = await ev(`location.hash.split('/')[2]`);
  const npc = await ev(`fetch('/api/campaigns/${cid}/entities?type=npc').then(r => r.json()).then(l => l.find(e => e.data.name === 'Esterno Ottavio'))`);
  const open = async () => {
    await ev(`location.hash = '#/c/' + ${JSON.stringify(cid)} + '/npc/' + ${JSON.stringify(npc.id)}`);
    // attende il modulo della versione attuale (dopo un salvataggio la vista si ridisegna)
    const v = await ev(`fetch('/api/entities/${npc.id}').then(r => r.json()).then(e => e.version)`);
    await waitFor(`document.querySelector('#main h1')?.textContent === 'Esterno Ottavio' && document.querySelector('[data-field=role] input') && new RegExp('versione ' + ${v} + ' ').test(document.getElementById('main').innerText)`, "editor PNG");
  };
  const external = (data) => ev(`fetch('/api/entities/${npc.id}').then(r => r.json()).then(e => fetch('/api/entities/${npc.id}', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: ${JSON.stringify(data)}, expectedVersion: e.version }) })).then(r => r.status)`);
  const typeIn = (sel, v) => ev(`(() => { const f = document.querySelector(${JSON.stringify(sel)}); f.value = ${JSON.stringify(v)}; f.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const server = () => ev(`fetch('/api/entities/${npc.id}').then(r => r.json()).then(e => e.data)`);
  // 1) campi diversi
  await open();
  assert.equal(await external({ role: "Doganiere" }), 200);
  await typeIn("[data-field=personality] textarea", "Sospettoso");
  assert.ok(await clickText("button", "Salva"));
  await waitFor(`document.querySelector('.modal h2')?.textContent === "Modificato in un'altra scheda"`, "finestra di unione");
  assert.match(await ev(`document.querySelector('.modal').innerText`), /Nessun campo modificato da entrambi/);
  assert.match(await ev(`document.querySelector('.modal').innerText`), /Ruolo/, "indica cosa arriva dall'altra scheda");
  assert.ok(await clickText(".modal button", "Salva unendo"));
  await waitFor(`/unendo/.test(document.querySelector('.toast.ok')?.textContent ?? '')`, "salvato unendo");
  let d = await server();
  assert.equal(d.role, "Doganiere"); assert.equal(d.personality, "Sospettoso");
  // 2) stesso campo: si sceglie la versione dell'altra scheda
  await open();
  assert.equal(await external({ role: "Contrabbandiere" }), 200);
  await typeIn("[data-field=role] input", "Esattore");
  assert.ok(await clickText("button", "Salva"));
  await waitFor(`document.querySelector('.modal [data-conflict=role]')`, "conflitto sul ruolo");
  await ev(`document.querySelector('.modal input[name="cf-role"][value=theirs]').click()`);
  assert.ok(await clickText(".modal button", "Salva unendo"));
  await waitFor(`!document.querySelector('.modal') && document.querySelector('.toast.ok')`, "salvataggio");
  d = await server();
  assert.equal(d.role, "Contrabbandiere");
  // 3) Annulla: nulla salvato, la bozza resta nel modulo
  await open();
  assert.equal(await external({ role: "Locandiere" }), 200);
  await typeIn("[data-field=role] input", "Bozza-ruolo");
  assert.ok(await clickText("button", "Salva"));
  await waitFor(`document.querySelector('.modal [data-conflict=role]')`, "conflitto");
  assert.ok(await clickText(".modal button", "Annulla (tieni la bozza)"));
  await waitFor(`!document.querySelector('.modal')`, "finestra chiusa");
  assert.equal(await ev(`document.querySelector('[data-field=role] input').value`), "Bozza-ruolo");
  assert.equal((await server()).role, "Locandiere");
  // la bozza è ancora "non salvata": uscire chiede conferma
  await ev(`[...document.querySelectorAll('#sidebar a')].find(a => a.getAttribute('href').endsWith('/quest')).click()`);
  await waitFor(`document.querySelector('.modal h2')?.textContent === 'Modifiche non salvate'`, "avviso");
  assert.ok(await clickText(".modal button", "Esci senza salvare"));
  await waitFor(`location.hash.endsWith('/quest') && !document.querySelector('.modal')`, "uscita");
  await dropConflicts();
  assert.deepEqual(problems, [], "problemi JS/console: " + problems.join(" | "));
});

test("UI: chiudere 'Aggiungi' o 'Genera' con dati inseriti chiede conferma (Annulla ed Esc); senza dati chiude subito", { skip }, async () => {
  const cid = await ev(`location.hash.split('/')[2]`);
  await ev(`location.hash = '#/c/' + ${JSON.stringify(cid)} + '/npc'`);
  await waitFor(`[...document.querySelectorAll('#main button')].some(b => b.textContent.includes('Aggiungi'))`, "elenco");
  // senza dati
  assert.ok(await clickText("#main button", "Aggiungi"));
  await waitFor(`document.querySelector('.modal input[type=text]')`, "modulo");
  assert.ok(await clickText(".modal button", "Annulla"));
  await waitFor(`!document.querySelector('.modal')`, "chiusura immediata");
  // con dati: Esc
  assert.ok(await clickText("#main button", "Aggiungi"));
  await waitFor(`document.querySelector('.modal input[type=text]')`, "modulo");
  await ev(`(() => { const i = document.querySelector('.modal input[type=text]'); i.value = 'Quasi perso'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); })()`);
  await waitFor(`document.querySelector(${JSON.stringify(top("h2"))})?.textContent === 'Dati non salvati'`, "conferma su Esc");
  assert.ok(await clickText(top("button"), "Annulla"));
  await waitFor(`document.querySelectorAll('#modal-root > .modal-bg').length === 1`, "torna al modulo");
  assert.equal(await ev(`document.querySelector('.modal input[type=text]').value`), "Quasi perso", "dati ancora presenti");
  // con dati: pulsante Annulla, poi conferma
  assert.ok(await clickText(".modal button", "Annulla"));
  await waitFor(`document.querySelector(${JSON.stringify(top("h2"))})?.textContent === 'Dati non salvati'`, "conferma su Annulla");
  assert.ok(await clickText(top("button"), "Chiudi senza salvare"));
  await waitFor(`!document.querySelector('.modal')`, "chiuso");
  assert.ok(!(await ev(`fetch('/api/campaigns/${cid}/entities?type=npc').then(r => r.json()).then(l => l.some(e => e.data.name === 'Quasi perso'))`)), "nulla creato");
  // finestra "Genera": stessa protezione
  assert.ok(await clickText("#main button", "Genera"));
  await waitFor(`document.querySelector('.modal input[type=text]')`, "modulo genera");
  await ev(`(() => { const i = document.querySelector('.modal input[type=text]'); i.value = 'seme-123'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  assert.ok(await clickText(".modal button", "Annulla"));
  await waitFor(`document.querySelector(${JSON.stringify(top("h2"))})?.textContent === 'Dati non salvati'`, "conferma su Genera");
  assert.ok(await clickText(top("button"), "Chiudi senza salvare"));
  await waitFor(`!document.querySelector('.modal')`, "chiuso");
  assert.deepEqual(problems, [], "problemi JS/console: " + problems.join(" | "));
});

test("UI: rigenerare un campo e annullare la rigenerazione con un clic", { skip }, async () => {
  const cid = await ev(`location.hash.split('/')[2]`);
  const npc = await ev(`fetch('/api/campaigns/${cid}/entities?type=npc').then(r => r.json()).then(l => l.find(e => e.data.name === 'Esterno Ottavio'))`);
  await ev(`location.hash = '#/c/' + ${JSON.stringify(cid)} + '/npc/' + ${JSON.stringify(npc.id)}`);
  await waitFor(`document.querySelector('[data-field=personality] .regen')`, "pulsante rigenera");
  assert.ok(!(await ev(`!!document.querySelector('[data-undo-regen]')`)), "nessun annullamento prima di rigenerare");
  await ev(`document.querySelector('[data-field=personality] .regen').click()`);
  await waitFor(`document.querySelector('[data-undo-regen]')`, "pulsante annulla rigenerazione");
  assert.notEqual((await ev(`fetch('/api/entities/${npc.id}').then(r => r.json())`)).data.personality, npc.data.personality);
  await ev(`document.querySelector('[data-undo-regen]').click()`);
  await waitFor(`/annullata/.test(document.querySelector('.toast.ok')?.textContent ?? '') && !document.querySelector('[data-undo-regen]')`, "annullata");
  assert.equal((await ev(`fetch('/api/entities/${npc.id}').then(r => r.json())`)).data.personality, npc.data.personality);
  assert.match(await ev(`[...document.querySelectorAll('#main details')].map(d => d.textContent).join(' ')`), /annullata rigenerazione "personality"/);
  assert.deepEqual(problems, [], "problemi JS/console: " + problems.join(" | "));
});

test("UI: modalità al tavolo — sessione corrente, scene, PNG, indizi, tracker compatto, scheda stampabile, segna giocata", { skip }, async () => {
  const cid = await ev(`location.hash.split('/')[2]`);
  await ev(`location.hash = '#/c/' + ${JSON.stringify(cid)} + '/tavolo'`);
  await waitFor(`document.querySelector('#main h1')?.textContent === 'Al tavolo' && document.querySelector('#main .mini-tracker')`, "al tavolo");
  const info = await ev(`({ scenes: document.querySelectorAll('[data-scene]').length, npcs: document.querySelectorAll('[data-npc]').length, clues: document.querySelectorAll('[data-clue]').length, pick: document.querySelector('[data-session-pick]').selectedOptions[0].textContent, text: document.getElementById('main').innerText })`);
  assert.ok(info.scenes >= 1 && info.npcs >= 1 && info.clues >= 1, JSON.stringify({ ...info, text: undefined }));
  assert.match(info.pick, /^1\. /, "sessione corrente = prima non giocata");
  for (const s of ["Missioni", "Scene e luoghi", "Indizi ottenibili", "Prossimi eventi della campagna"]) assert.ok(info.text.includes(s), s);
  // tracker compatto: danno al ragno
  const hpBefore = await ev(`[...document.querySelectorAll('.mini-tracker tr')].find(r => r.innerText.includes('Ragno')).children[2].textContent`);
  await ev(`(() => { const r = [...document.querySelectorAll('.mini-tracker tr')].find(r => r.innerText.includes('Ragno')); r.querySelector('input').value = 3; r.querySelector('button.danger').click(); })()`);
  await waitFor(`[...document.querySelectorAll('.mini-tracker tr')].find(r => r.innerText.includes('Ragno')).children[2].textContent !== ${JSON.stringify(hpBefore)}`, "PF aggiornati");
  const [hp] = hpBefore.split("/").map(Number);
  assert.equal(await ev(`fetch('/api/campaigns/${cid}/tracker').then(r => r.json()).then(t => t.combatants.find(c => c.name.includes('Ragno')).hp)`), Math.max(0, hp - 3));
  // scheda stampabile
  const href = await ev(`[...document.querySelectorAll('#main a')].find(a => a.textContent.includes('Scheda stampabile')).getAttribute('href')`);
  const sheet = await ev(`fetch(${JSON.stringify(href)}).then(async r => ({ s: r.status, t: await r.text() }))`);
  assert.equal(sheet.s, 200);
  assert.match(sheet.t, /Indizi ottenibili/);
  // segna come giocata: resta sulla stessa sessione e la successiva diventa la corrente
  const sid = await ev(`document.querySelector('[data-session-pick]').value`);
  assert.ok(await clickText("#main button", "Segna come giocata"));
  await waitFor(`location.hash.endsWith(${JSON.stringify("/" + sid)}) && /da giocare/.test([...document.querySelectorAll('#main button')].map(b => b.textContent).join(' '))`, "sessione segnata");
  assert.equal(await ev(`fetch('/api/entities/${sid}').then(r => r.json()).then(e => e.data.played)`), true);
  await ev(`location.hash = '#/c/' + ${JSON.stringify(cid)} + '/tavolo'`);
  await waitFor(`/^2\\. /.test(document.querySelector('[data-session-pick]')?.selectedOptions[0].textContent ?? '')`, "corrente = sessione 2");
  assert.deepEqual(problems, [], "problemi JS/console: " + problems.join(" | "));
});

test("UI: nuova campagna con struttura narrativa scelta (indagine a nodi)", { skip }, async () => {
  await ev(`location.hash = '#/'`);
  await waitFor(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('Nuova campagna'))`, "home");
  assert.ok(await clickText("button", "Nuova campagna"));
  await waitFor(`document.querySelector('.modal [data-structure]')`, "scelta struttura");
  await ev(`(() => { const s = document.querySelector('.modal [data-structure]'); s.value = 'indagine'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  assert.match(await ev(`document.querySelector('.modal').innerText`), /regola dei tre indizi/);
  assert.ok(await clickText(".modal button", "Crea"));
  await waitFor(`location.hash.includes('/panoramica')`, "campagna creata");
  const cid = await ev(`location.hash.split('/')[2]`);
  const c = await ev(`fetch('/api/campaigns/${cid}').then(r => r.json())`);
  assert.match(c.centralConflict, /indagine a nodi/i);
  const clues = await ev(`fetch('/api/campaigns/${cid}/entities?type=clue').then(r => r.json()).then(l => l.map(e => e.data.name))`);
  assert.ok(clues.includes("La leggenda degli anziani"), JSON.stringify(clues));
  assert.deepEqual(problems, [], "problemi JS/console: " + problems.join(" | "));
});
