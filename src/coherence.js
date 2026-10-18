// Controllo di coerenza narrativa. Funzione pura: input = campagna + entità, output = elenco di segnalazioni.
// Severità: "errore" (contraddizione certa), "rischio" (probabile problema), "suggerimento" (miglioria).
import { dungeonConnectivity, dungeonDataErrors } from "./dungeon.js";

const SEV_ORDER = { errore: 0, rischio: 1, suggerimento: 2 };

import { FIRST_M, FIRST_F, SURNAMES } from "./content.js";

export function checkCoherence(campaign, entities) {
  const live = entities.filter((e) => !e.deleted);
  const by = new Map(live.map((e) => [e.id, e]));
  const ofType = (t) => live.filter((e) => e.type === t);
  const issues = [];
  const ref = (id) => { const e = by.get(id); return e ? { id: e.id, type: e.type, name: e.data.name } : { id, type: "?", name: "(inesistente)" }; };
  const push = (severity, rule, message, ids, suggestion) =>
    issues.push({ severity, rule, message, entities: [...new Set(ids.filter(Boolean))].map(ref), suggestion });
  const name = (id) => by.get(id)?.data.name ?? id;

  // ---- grafi di supporto ----
  const parentOf = (id) => by.get(id)?.data.parent ?? null;
  const ancestors = (id) => { const out = []; let c = parentOf(id); const seen = new Set(); while (c && !seen.has(c)) { out.push(c); seen.add(c); c = parentOf(c); } return out; };
  const compatibleLoc = (a, b) => a === b || ancestors(a).includes(b) || ancestors(b).includes(a);

  // distanze di viaggio (giorni) tra luoghi, percorsi bidirezionali
  const adj = new Map(ofType("location").map((l) => [l.id, []]));
  for (const l of ofType("location")) for (const c of l.data.connections ?? []) {
    if (!adj.has(c.to)) continue;
    adj.get(l.id).push([c.to, c.days ?? 0]); adj.get(c.to).push([l.id, c.days ?? 0]);
  }
  for (const l of ofType("location")) { const p = l.data.parent; if (p && adj.has(p)) { adj.get(l.id).push([p, 0]); adj.get(p).push([l.id, 0]); } }
  const distCache = new Map();
  const travelDays = (a, b) => {
    if (a === b) return 0;
    if (!distCache.has(a)) {
      const d = new Map([[a, 0]]); const q = [a];
      while (q.length) { q.sort((x, y) => d.get(x) - d.get(y)); const c = q.shift(); for (const [n, w] of adj.get(c) ?? []) if (!d.has(n) || d.get(n) > d.get(c) + w) { d.set(n, d.get(c) + w); q.push(n); } }
      distCache.set(a, d);
    }
    return distCache.get(a).get(b) ?? Infinity;
  };

  const npcPos = (npc, day) => {
    const s = (npc.data.schedule ?? []).find((x) => x.fromDay <= day && day <= x.toDay);
    return s ? s.location : npc.data.location;
  };
  const isHistoric = (ev) => ev.data.happened || ev.data.day <= 0;

  // ---- 1. riferimenti, campi base, PNG ----
  for (const npc of ofType("npc")) {
    const d = npc.data;
    for (const s of d.schedule ?? []) if (s.fromDay > s.toDay) push("errore", "PNG-AGENDA", `${d.name}: intervallo di giorni invertito (${s.fromDay}→${s.toDay}).`, [npc.id], "Correggi i giorni di inizio e fine.");
    const sch = [...(d.schedule ?? [])].sort((a, b) => a.fromDay - b.fromDay);
    for (let i = 1; i < sch.length; i++) {
      const prev = sch[i - 1], cur = sch[i];
      if (cur.fromDay <= prev.toDay && cur.location !== prev.location)
        push("errore", "PNG-AGENDA", `${d.name} è in due luoghi contemporaneamente (${name(prev.location)} e ${name(cur.location)}) tra i giorni ${cur.fromDay} e ${Math.min(prev.toDay, cur.toDay)}.`, [npc.id, prev.location, cur.location], "Separa gli intervalli o rimuovi uno dei due spostamenti.");
      else if (cur.location !== prev.location) {
        const gap = cur.fromDay - prev.toDay, need = travelDays(prev.location, cur.location);
        if (need > gap) push("rischio", "PNG-VIAGGIO", `${d.name} dovrebbe spostarsi da ${name(prev.location)} a ${name(cur.location)} in ${gap} giorni, ma il percorso richiede ${need === Infinity ? "un collegamento inesistente" : need + " giorni"}.`, [npc.id, prev.location, cur.location], "Aggiungi giorni tra i due intervalli o un percorso più rapido.");
      }
    }
    if (!d.location && !(d.schedule ?? []).length) push("rischio", "PNG-SENZA-LUOGO", `${d.name} non ha un luogo: comparirebbe senza spiegazione.`, [npc.id], "Assegna un luogo abituale.");
    if (!(d.motivations ?? []).length || !(d.goals ?? []).length) push("suggerimento", "PNG-DECORATIVO", `${d.name} non ha motivazioni e/o obiettivi: la personalità è solo decorativa.`, [npc.id], "Aggiungi almeno una motivazione e un obiettivo che influenzino le sue azioni.");
    else if (!(d.behaviors ?? []).length) push("suggerimento", "PNG-COMPORTAMENTO", `${d.name} non ha comportamenti previsti: le motivazioni non guidano alcuna reazione.`, [npc.id], "Descrivi come reagisce in 2–3 situazioni.");
    const factions = d.factions ?? [];
    for (let i = 0; i < factions.length; i++) for (let j = i + 1; j < factions.length; j++) {
      const fa = by.get(factions[i]), fb = by.get(factions[j]);
      if ((fa?.data.relations ?? []).some((r) => r.faction === factions[j] && r.kind === "nemica") || (fb?.data.relations ?? []).some((r) => r.faction === factions[i] && r.kind === "nemica"))
        push("rischio", "PNG-FAZIONI", `${d.name} appartiene a due fazioni nemiche (${name(factions[i])} e ${name(factions[j])}).`, [npc.id, factions[i], factions[j]], "Se è una spia, annotalo tra i segreti; altrimenti rimuovi un'appartenenza.");
    }
  }

  // ---- 2. cicli nelle dipendenze dichiarate ----
  const deps = new Map();
  const addDep = (from, to, intentional = false) => { if (!deps.has(from)) deps.set(from, []); deps.get(from).push({ to, intentional }); };
  for (const q of ofType("quest")) for (const p of q.data.prerequisites ?? []) addDep(q.id, p.target, p.intentionalCycle);
  for (const e of ofType("event")) for (const r of e.data.requires ?? []) addDep(e.id, r);
  for (const c of ofType("clue")) for (const r of c.data.requires ?? []) addDep(c.id, r);
  for (const l of ofType("location")) if (l.data.unlockedBy) addDep(l.id, l.data.unlockedBy);
  const color = new Map();
  const stack = [];
  const cycles = [];
  const dfs = (n) => {
    color.set(n, 1); stack.push(n);
    for (const { to, intentional } of deps.get(n) ?? []) {
      if (color.get(to) === 1) { const i = stack.indexOf(to); cycles.push({ path: stack.slice(i).concat(to), intentional }); }
      else if (!color.get(to) && by.has(to)) dfs(to);
    }
    stack.pop(); color.set(n, 2);
  };
  for (const n of deps.keys()) if (!color.get(n)) dfs(n);
  for (const c of cycles) {
    const allIntentional = c.path.slice(0, -1).every((id, i) => (deps.get(id) ?? []).find((d) => d.to === c.path[i + 1])?.intentional);
    push(allIntentional ? "suggerimento" : "errore", "CICLO", `Dipendenza circolare: ${c.path.map(name).join(" → ")}.`, c.path,
      allIntentional ? "Ciclo marcato come intenzionale: verifica che esista una via d'uscita narrativa." : "Rimuovi uno dei prerequisiti (o marca il ciclo come intenzionale se è voluto).");
  }

  // ---- 3. raggiungibilità (punto fisso) ----
  const reached = new Set();
  for (const e of ofType("event")) if (isHistoric(e)) reached.add(e.id);
  const accessibleLoc = (id) => reached.has(id);
  const npcAccessible = (npc) => {
    if (!npc || npc.data.status === "morto") return false;
    const locs = [npc.data.location, ...(npc.data.schedule ?? []).map((s) => s.location)].filter(Boolean);
    return locs.some((l) => accessibleLoc(l));
  };
  let changed = true;
  const why = new Map();
  while (changed) {
    changed = false;
    const mark = (id) => { if (!reached.has(id)) { reached.add(id); changed = true; } };
    for (const l of ofType("location")) {
      const d = l.data;
      if (d.access === "pubblico" || (d.unlockedBy && reached.has(d.unlockedBy))) mark(l.id);
    }
    for (const c of ofType("clue")) {
      const d = c.data;
      const gated = (d.requires ?? []).every((r) => reached.has(r));
      const item = d.foundInItem ? by.get(d.foundInItem) : null;
      const source =
        (d.foundAtLocation && accessibleLoc(d.foundAtLocation)) ||
        (d.foundWithNpc && npcAccessible(by.get(d.foundWithNpc))) ||
        (item && item.data.origin && (reached.has(item.data.origin) || (by.get(item.data.origin)?.type === "npc" && npcAccessible(by.get(item.data.origin)))));
      if (gated && source) mark(c.id);
    }
    for (const q of ofType("quest")) {
      const d = q.data;
      const ok =
        (d.prerequisites ?? []).every((p) => reached.has(p.target)) &&
        (!d.giver || npcAccessible(by.get(d.giver))) &&
        (d.locations ?? []).every((l) => accessibleLoc(l)) &&
        (d.requiredClues ?? []).every((c) => reached.has(c)) &&
        (d.outcomes ?? []).length > 0;
      if (ok) mark(q.id);
    }
    for (const e of ofType("event")) {
      const d = e.data;
      const ok = (d.requires ?? []).every((r) => reached.has(r)) && (!d.location || accessibleLoc(d.location)) && (d.requiresKnowledge ?? []).every((c) => reached.has(c));
      if (ok) mark(e.id);
    }
  }
  const unmet = (id) => {
    const e = by.get(id), d = e.data, out = [];
    if (e.type === "location") { if (d.access !== "pubblico") out.push(d.unlockedBy ? `sbloccato da "${name(d.unlockedBy)}", a sua volta irraggiungibile` : `accesso "${d.access}" senza alcun elemento che lo sblocchi`); }
    if (e.type === "clue") {
      for (const r of d.requires ?? []) if (!reached.has(r)) out.push(`richiede "${name(r)}", non raggiungibile`);
      if (!d.foundAtLocation && !d.foundWithNpc && !d.foundInItem) out.push("non ha alcuna fonte (luogo, PNG o oggetto)");
      else {
        if (d.foundAtLocation && !accessibleLoc(d.foundAtLocation)) out.push(`il luogo "${name(d.foundAtLocation)}" non è accessibile`);
        if (d.foundWithNpc && !npcAccessible(by.get(d.foundWithNpc))) out.push(`il PNG "${name(d.foundWithNpc)}" è inaccessibile o morto`);
        if (d.foundInItem) out.push(`l'oggetto "${name(d.foundInItem)}" non è ottenibile`);
      }
    }
    if (e.type === "quest") {
      for (const p of d.prerequisites ?? []) if (!reached.has(p.target)) out.push(`prerequisito "${name(p.target)}" non soddisfacibile`);
      if (d.giver && !npcAccessible(by.get(d.giver))) out.push(`il committente "${name(d.giver)}" non è raggiungibile (morto o in luogo inaccessibile)`);
      for (const l of d.locations ?? []) if (!accessibleLoc(l)) out.push(`il luogo "${name(l)}" non è accessibile`);
      for (const c of d.requiredClues ?? []) if (!reached.has(c)) out.push(`l'indizio necessario "${name(c)}" non è scopribile`);
      if (!(d.outcomes ?? []).length) out.push("non ha esiti possibili");
    }
    if (e.type === "event") {
      for (const r of d.requires ?? []) if (!reached.has(r)) out.push(`dipende da "${name(r)}", non raggiungibile`);
      if (d.location && !accessibleLoc(d.location)) out.push(`il luogo "${name(d.location)}" non è accessibile`);
      for (const c of d.requiresKnowledge ?? []) if (!reached.has(c)) out.push(`richiede la conoscenza di "${name(c)}", che i giocatori non possono scoprire`);
    }
    return out;
  };
  for (const l of ofType("location")) if (!reached.has(l.id)) push("errore", "LUOGO-INACCESSIBILE", `Il luogo "${l.data.name}" non è mai accessibile: ${unmet(l.id).join("; ")}.`, [l.id, l.data.unlockedBy], "Imposta l'accesso a 'pubblico' oppure collega uno sblocco raggiungibile.");
  for (const c of ofType("clue")) if (!reached.has(c.id)) push("errore", "INDIZIO-IRRAGGIUNGIBILE", `L'indizio "${c.data.name}" non può essere scoperto: ${unmet(c.id).join("; ")}.`, [c.id, c.data.foundAtLocation, c.data.foundWithNpc, ...(c.data.requires ?? [])], "Assegna una fonte accessibile oppure rimuovi o sposta il vincolo che lo blocca.");
  // Un PNG scomparso non si trova dove dovrebbe: se è l'unica fonte di un indizio (o il committente), serve un modo per ritrovarlo.
  const missing = (id) => by.get(id)?.type === "npc" && by.get(id).data.status === "scomparso";
  for (const c of ofType("clue")) {
    const d = c.data;
    if (reached.has(c.id) && missing(d.foundWithNpc) && !d.foundAtLocation && !d.foundInItem)
      push("rischio", "INDIZIO-PNG-SCOMPARSO", `L'indizio "${d.name}" può darlo solo ${name(d.foundWithNpc)}, che è scomparso.`, [c.id, d.foundWithNpc], "Aggiungi una fonte alternativa (luogo o oggetto) o una missione per ritrovare il PNG, poi aggiorna il suo stato.");
  }
  for (const q of ofType("quest")) if (missing(q.data.giver) && q.data.status === "non iniziata")
    push("rischio", "COMMITTENTE-SCOMPARSO", `Il committente di "${q.data.name}" (${name(q.data.giver)}) è scomparso: non può affidare la missione.`, [q.id, q.data.giver], "Cambia committente o prevedi come i giocatori lo ritrovano.");
  for (const q of ofType("quest")) if (!reached.has(q.id) && q.data.status !== "completata") push("errore", "MISSIONE-IMPOSSIBILE", `La missione "${q.data.name}" non è completabile: ${unmet(q.id).join("; ")}.`, [q.id, q.data.giver, ...(q.data.prerequisites ?? []).map((p) => p.target), ...(q.data.requiredClues ?? [])], "Rendi raggiungibili i prerequisiti, rimuovi l'indizio necessario o aggiungi una via alternativa.");
  for (const e of ofType("event")) if (!reached.has(e.id)) {
    const missing = (e.data.requiresKnowledge ?? []).filter((c) => !reached.has(c));
    if (missing.length) push("errore", "EVENTO-CONOSCENZA", `L'evento "${e.data.name}" richiede informazioni che i giocatori non possono scoprire: ${missing.map(name).join(", ")}.`, [e.id, ...missing], "Rendi scopribili gli indizi richiesti prima del giorno dell'evento o toglili dai requisiti.");
    else push("rischio", "EVENTO-IRRAGGIUNGIBILE", `L'evento "${e.data.name}" potrebbe non verificarsi mai: ${unmet(e.id).join("; ")}.`, [e.id], "Verifica i requisiti dell'evento.");
  }

  // ---- 4. eventi: cronologia, presenza dei PNG, conoscenza ----
  for (const e of ofType("event")) {
    const d = e.data;
    for (const r of d.requires ?? []) {
      const re = by.get(r);
      if (re?.type === "event" && re.data.day > d.day) push("errore", "CRONOLOGIA", `L'evento "${d.name}" (giorno ${d.day}) precede "${re.data.name}" (giorno ${re.data.day}) da cui dipende.`, [e.id, r], "Sposta uno dei due eventi o elimina la dipendenza.");
    }
    if (d.kind === "storico" && d.day > 0 && !d.happened) push("rischio", "CRONOLOGIA", `L'evento storico "${d.name}" è collocato nel futuro (giorno ${d.day}).`, [e.id], "Usa un giorno ≤ 0 oppure cambia il tipo in 'previsto'.");
    if (d.kind === "previsto" && d.day <= 0 && !d.happened) push("rischio", "CRONOLOGIA", `L'evento previsto "${d.name}" è nel passato (giorno ${d.day}) ma non è segnato come accaduto.`, [e.id], "Segnalo come accaduto o spostalo nel futuro.");
    if (d.happened && d.day > (campaign.currentDay ?? 1)) push("rischio", "CRONOLOGIA", `L'evento "${d.name}" è accaduto al giorno ${d.day}, dopo il giorno corrente (${campaign.currentDay}).`, [e.id], "Correggi il giorno corrente o l'evento.");
    for (const pid of d.participants ?? []) {
      const npc = by.get(pid);
      if (!npc) continue;
      if (d.location) {
        const pos = npcPos(npc, d.day);
        if (pos && !compatibleLoc(pos, d.location)) push("errore", "PNG-LUOGO", `${npc.data.name} partecipa a "${d.name}" a ${name(d.location)} (giorno ${d.day}), ma in quel giorno si trova a ${name(pos)}.`, [pid, e.id, pos, d.location], "Aggiungi uno spostamento del PNG verso il luogo dell'evento o rimuovilo dai partecipanti.");
        else if (!pos) push("rischio", "PNG-LUOGO", `${npc.data.name} partecipa a "${d.name}" ma non ha alcun luogo noto.`, [pid, e.id], "Assegna un luogo al PNG.");
      }
      if (!isHistoric(e) && npc.data.status === "morto") push("errore", "PNG-MORTO", `${npc.data.name} è morto ma partecipa all'evento futuro "${d.name}".`, [pid, e.id], "Rimuovilo dai partecipanti o modifica lo stato.");
      else if (!isHistoric(e) && ["prigioniero", "scomparso"].includes(npc.data.status)) push("rischio", "PNG-STATO", `${npc.data.name} è ${npc.data.status} ma partecipa a "${d.name}".`, [pid, e.id], "Spiega come può essere presente o rimuovilo.");
    }
    if (!d.location && !isHistoric(e)) push("suggerimento", "EVENTO-LUOGO", `L'evento "${d.name}" non ha un luogo.`, [e.id], "Indica dove si svolge.");
  }

  // ---- 5. conoscenza dei PNG ----
  for (const npc of ofType("npc")) for (const k of npc.data.knowledge ?? []) {
    if (!k.source) { push("rischio", "CONOSCENZA-SENZA-FONTE", `${npc.data.name} conosce "${k.fact}" senza una fonte plausibile.`, [npc.id], "Indica da dove proviene l'informazione (indizio, evento, luogo o altro PNG)."); continue; }
    const s = by.get(k.source);
    if (!s) continue;
    if (s.type === "npc" && s.id === npc.id) push("rischio", "CONOSCENZA-SENZA-FONTE", `${npc.data.name} cita sé stesso come fonte di "${k.fact}".`, [npc.id], "Indica una fonte esterna.");
    if (s.type === "event") {
      if (!isHistoric(s) && s.data.day > (campaign.currentDay ?? 1)) push("errore", "CONOSCENZA-FUTURA", `${npc.data.name} conosce "${k.fact}" grazie a "${s.data.name}", che non è ancora avvenuto (giorno ${s.data.day}).`, [npc.id, s.id], "Usa una fonte già avvenuta.");
      else if ((s.data.participants ?? []).length && !(s.data.participants ?? []).includes(npc.id)) push("rischio", "CONOSCENZA-FONTE", `${npc.data.name} cita come fonte "${s.data.name}", a cui non ha partecipato.`, [npc.id, s.id], "Aggiungi il PNG ai partecipanti o indica un'altra fonte.");
    }
    if (k.hidden && !k.revealedBy) push("suggerimento", "SEGRETO-NON-RIVELABILE", `${npc.data.name}: l'informazione nascosta "${k.fact}" non ha un indizio che la riveli.`, [npc.id], "Collega un indizio che permetta ai giocatori di scoprirla.");
    if (k.revealedBy && !reached.has(k.revealedBy)) push("errore", "SEGRETO-IRRAGGIUNGIBILE", `${npc.data.name}: l'informazione "${k.fact}" è rivelata da "${name(k.revealedBy)}", che non è scopribile.`, [npc.id, k.revealedBy], "Rendi scopribile l'indizio.");
  }

  // ---- 6. misteri ----
  for (const m of ofType("mystery")) {
    const d = m.data;
    const good = (d.clues ?? []).filter((c) => reached.has(c));
    if (!(d.clues ?? []).length) push("errore", "MISTERO-SENZA-INDIZI", `Il mistero "${d.name}" non ha indizi: la soluzione non è verificabile.`, [m.id], "Aggiungi almeno tre indizi veritieri.");
    else if (good.length < 3) push("rischio", "MISTERO-POCHI-INDIZI", `Il mistero "${d.name}" ha solo ${good.length} indizi scopribili (se ne consigliano almeno tre, per ridondanza).`, [m.id, ...(d.clues ?? [])], "Aggiungi indizi o rendi scopribili quelli esistenti.");
    for (const c of d.clues ?? []) if (by.get(c)?.data.truthful === false) push("errore", "MISTERO-INDIZIO-FALSO", `"${name(c)}" è un indizio falso ma è elencato tra quelli veritieri di "${d.name}".`, [m.id, c], "Spostalo tra le false piste.");
    for (const c of d.redHerrings ?? []) {
      const cd = by.get(c)?.data;
      if (cd?.truthful) push("rischio", "MISTERO-FALSA-PISTA", `"${name(c)}" è marcato come veritiero ma elencato tra le false piste di "${d.name}".`, [m.id, c], "Correggi il flag o l'elenco.");
      if (cd && !cd.truthful && !cd.debunkedBy) push("suggerimento", "FALSA-PISTA-NON-SMENTITA", `La falsa pista "${name(c)}" non può essere smentita dai giocatori.`, [c], "Indica quale indizio la smentisce.");
      if (cd?.debunkedBy && !reached.has(cd.debunkedBy)) push("errore", "FALSA-PISTA-SMENTITA-DA-IRRAGGIUNGIBILE", `La falsa pista "${name(c)}" è smentita da "${name(cd.debunkedBy)}", non scopribile.`, [c, cd.debunkedBy], "Rendi scopribile l'indizio che la smentisce.");
    }
    if (!d.culprit) push("suggerimento", "MISTERO-RESPONSABILE", `Il mistero "${d.name}" non indica il responsabile.`, [m.id], "Collega il PNG o l'entità responsabile.");
  }
  for (const c of ofType("clue")) if (c.data.truthful && !c.data.mystery && !ofType("quest").some((q) => (q.data.clues ?? []).includes(c.id))) push("suggerimento", "INDIZIO-ORFANO", `L'indizio "${c.data.name}" non è collegato a nessun mistero o missione.`, [c.id], "Collegalo a un mistero o a una missione.");

  // ---- 7. oggetti ----
  for (const it of ofType("item")) {
    const d = it.data;
    if (!d.origin && !d.holder) push("rischio", "OGGETTO-SENZA-ORIGINE", `L'oggetto "${d.name}" compare senza spiegazione (nessuna origine né possessore).`, [it.id], "Indica una missione, un luogo, un PNG o un evento da cui proviene.");
    if (d.origin && by.get(d.origin)?.type === "quest" && !(by.get(d.origin).data.rewards ?? []).some((r) => r.item === it.id)) push("rischio", "OGGETTO-RICOMPENSA", `"${d.name}" dice di provenire dalla missione "${name(d.origin)}", che non lo elenca tra le ricompense.`, [it.id, d.origin], "Aggiungi l'oggetto alle ricompense della missione.");
    if (d.holder && by.get(d.holder)?.data.status === "morto" && !d.origin) push("suggerimento", "OGGETTO-POSSESSORE", `"${d.name}" è posseduto da un PNG morto: indica dove si trova ora.`, [it.id, d.holder], "Sposta l'oggetto o cambia possessore.");
  }

  // ---- 8. missioni: struttura, stato, conseguenze ----
  const dependsOn = (qid) => { // chiusura transitiva dei prerequisiti
    const out = new Set(), st = [qid];
    while (st.length) { const c = st.pop(); for (const d of deps.get(c) ?? []) if (!out.has(d.to)) { out.add(d.to); st.push(d.to); } }
    return out;
  };
  const mentions = (q, npcId) => q.data.giver === npcId || (q.data.npcs ?? []).includes(npcId);
  for (const q of ofType("quest")) {
    const d = q.data;
    if (!d.giver) push("rischio", "MISSIONE-COMMITTENTE", `La missione "${d.name}" non ha un committente.`, [q.id], "Assegna un PNG committente.");
    if ((d.outcomes ?? []).length === 1) push("suggerimento", "MISSIONE-ESITO-UNICO", `La missione "${d.name}" ha un solo esito: nessuna scelta significativa.`, [q.id], "Aggiungi almeno un esito alternativo.");
    if (!(d.locations ?? []).length) push("rischio", "MISSIONE-LUOGHI", `La missione "${d.name}" non indica dove si svolge.`, [q.id], "Collega almeno un luogo.");
    if (d.giver && by.get(d.giver)?.data.status === "morto" && d.status !== "completata") push("errore", "COMMITTENTE-MORTO", `Il committente di "${d.name}" (${name(d.giver)}) è morto.`, [q.id, d.giver], "Cambia committente o stato del PNG.");
    if (d.status === "completata") {
      for (const p of d.prerequisites ?? []) { const t = by.get(p.target); if (t?.type === "quest" && t.data.status !== "completata") push("errore", "STATO-INCOERENTE", `"${d.name}" risulta completata ma il prerequisito "${t.data.name}" no.`, [q.id, t.id], "Allinea gli stati."); }
      if (d.chosenOutcome && !(d.outcomes ?? []).some((o) => o.label === d.chosenOutcome)) push("rischio", "STATO-INCOERENTE", `L'esito scelto di "${d.name}" non corrisponde a nessun esito definito.`, [q.id], "Scegli uno degli esiti definiti.");
    }
    for (const o of d.outcomes ?? []) for (const ef of o.effects ?? []) {
      const t = ef.target ? by.get(ef.target) : null;
      if (ef.kind === "npcStatus" && t && t.type !== "npc") push("errore", "EFFETTO-NON-VALIDO", `Effetto "npcStatus" su "${t.data.name}" che non è un PNG (esito "${o.label}" di "${d.name}").`, [q.id, t.id], "Scegli un PNG come bersaglio.");
      if (ef.kind === "npcStatus" && t?.type === "npc" && !["vivo", "morto", "scomparso", "prigioniero"].includes(ef.value)) push("errore", "EFFETTO-NON-VALIDO", `Stato "${ef.value}" non valido per ${t.data.name}.`, [q.id, t.id], "Usa vivo, morto, scomparso o prigioniero.");
      if (ef.kind === "npcLocation" && !ef.valueRef) push("errore", "EFFETTO-NON-VALIDO", `Spostamento di ${t ? t.data.name : "un PNG"} senza luogo di destinazione (esito "${o.label}").`, [q.id], "Indica il luogo.");
      if (ef.kind === "factionStanding" && (!Number.isFinite(Number(ef.value)) || Math.abs(Number(ef.value)) > 5)) push("rischio", "EFFETTO-NON-VALIDO", `Variazione di reputazione "${ef.value}" anomala per ${t ? t.data.name : "una fazione"}.`, [q.id], "Usa un valore tra -5 e +5.");
    }
  }
  // conseguenze che contraddicono decisioni o necessità successive
  const quests = ofType("quest"), events = ofType("event");
  for (const q of quests) {
    const outs = q.data.outcomes ?? [];
    const killing = new Map(); // npc -> esiti che lo uccidono / lo rendono indisponibile
    for (const o of outs) for (const ef of o.effects ?? []) if (ef.kind === "npcStatus" && ["morto", "scomparso", "prigioniero"].includes(ef.value) && ef.target) {
      if (!killing.has(ef.target)) killing.set(ef.target, []);
      killing.get(ef.target).push({ label: o.label, value: ef.value });
    }
    for (const [npcId, list] of killing) {
      const always = list.length === outs.length;
      const dependents = quests.filter((r) => r.id !== q.id && dependsOn(r.id).has(q.id));
      for (const r of dependents) {
        if (r.data.giver === npcId || mentions(r, npcId)) {
          const dead = list.some((x) => x.value === "morto");
          push(always && dead ? "errore" : "rischio", "CONSEGUENZA-CONTRADDITTORIA",
            `${name(npcId)} ${always ? "è sempre" : "può diventare"} ${list[0].value} dopo "${q.data.name}", ma "${r.data.name}" (successiva) ${r.data.giver === npcId ? "lo ha come committente" : "lo coinvolge"}.`,
            [q.id, r.id, npcId], "Rimuovi il PNG dalla missione successiva, prevedi un sostituto, o rendi non letale l'esito.");
        }
      }
      for (const ev of events) {
        if ((ev.data.participants ?? []).includes(npcId) && !isHistoric(ev) && (ev.data.requires ?? []).some((rq) => rq === q.id || dependsOn(rq).has(q.id) || rq === q.id))
          push(always ? "errore" : "rischio", "CONSEGUENZA-CONTRADDITTORIA", `L'evento "${ev.data.name}", successivo a "${q.data.name}", coinvolge ${name(npcId)}, che dopo quell'esito può non essere disponibile.`, [q.id, ev.id, npcId], "Rimuovi il PNG dall'evento o modifica l'esito.");
      }
      // stato contraddittorio fra missioni in sequenza
      for (const r of quests.filter((x) => x.id !== q.id && dependsOn(x.id).has(q.id)))
        for (const o of r.data.outcomes ?? []) for (const ef of o.effects ?? [])
          if (ef.kind === "npcStatus" && ef.target === npcId && always && ef.value !== list[0].value)
            push("errore", "CONSEGUENZA-CONTRADDITTORIA", `${name(npcId)} è sempre ${list[0].value} dopo "${q.data.name}", ma "${r.data.name}" gli assegna lo stato "${ef.value}".`, [q.id, r.id, npcId], "Allinea gli stati o rimuovi uno dei due effetti.");
    }
  }
  // effetti degli eventi non applicabili
  for (const e of events) for (const ef of e.data.effects ?? []) {
    const t = ef.target ? by.get(ef.target) : null;
    if (ef.kind === "nota") continue;
    if (!t) push("rischio", "EFFETTO-NON-VALIDO", `L'evento "${e.data.name}" ha un effetto "${ef.kind}" senza bersaglio.`, [e.id], "Indica il bersaglio o usa 'nota'.");
    else if ((ef.kind === "npcStatus" || ef.kind === "npcLocation") && t.type !== "npc") push("errore", "EFFETTO-NON-VALIDO", `Effetto "${ef.kind}" dell'evento "${e.data.name}" su "${t.data.name}" che non è un PNG.`, [e.id, t.id], "Scegli un PNG.");
  }

  // ---- 9. sessioni ----
  const sessionOf = new Map();
  for (const s of ofType("session")) for (const q of s.data.quests ?? []) if (!sessionOf.has(q) || sessionOf.get(q) > s.data.number) sessionOf.set(q, s.data.number);
  for (const q of quests) {
    if (!sessionOf.has(q.id)) { push("suggerimento", "SESSIONE-MANCANTE", `La missione "${q.data.name}" non è assegnata a nessuna sessione.`, [q.id], "Assegnala a una sessione."); continue; }
    for (const p of q.data.prerequisites ?? []) {
      const pt = by.get(p.target);
      if (pt?.type === "quest" && sessionOf.has(pt.id) && sessionOf.get(pt.id) > sessionOf.get(q.id))
        push("rischio", "SESSIONE-ORDINE", `"${q.data.name}" è pianificata nella sessione ${sessionOf.get(q.id)}, prima del suo prerequisito "${pt.data.name}" (sessione ${sessionOf.get(pt.id)}).`, [q.id, pt.id], "Riordina le sessioni.");
    }
  }
  const numbers = ofType("session").map((s) => s.data.number).sort((a, b) => a - b);
  if (new Set(numbers).size !== numbers.length) push("rischio", "SESSIONE-NUMERI", "Ci sono sessioni con lo stesso numero.", ofType("session").map((s) => s.id), "Rinumera le sessioni.");

  // ---- 10. luoghi, fazioni, dungeon, campagna ----
  const referenced = new Set();
  for (const e of live) for (const v of JSON.stringify(e.data).match(/"((?:loc|npc|fac|que|cly|clu|mys|ite|eve|ses|dun)_[0-9a-f]{10})"/g) ?? []) referenced.add(v.replace(/"/g, ""));
  for (const l of ofType("location")) {
    const hasConn = (l.data.connections ?? []).length > 0 || (adj.get(l.id) ?? []).length > 0;
    if (!hasConn && l.data.kind !== "continente" && l.data.kind !== "regione" && !l.data.parent) push("suggerimento", "LUOGO-ISOLATO", `Il luogo "${l.data.name}" non è collegato a nessun altro da percorsi.`, [l.id], "Aggiungi un percorso o un luogo contenitore.");
    if (!referenced.has(l.id) && l.data.kind !== "regione") push("suggerimento", "LUOGO-NON-USATO", `Il luogo "${l.data.name}" non è usato da missioni, PNG, eventi o fazioni.`, [l.id], "Collegalo a un elemento della trama.");
  }
  for (const f of ofType("faction")) {
    if (!f.data.leader) push("suggerimento", "FAZIONE-CAPO", `La fazione "${f.data.name}" non ha un capo.`, [f.id], "Assegna un PNG capo.");
    for (const r of f.data.relations ?? []) {
      const other = by.get(r.faction);
      const back = other?.data.relations?.find((x) => x.faction === f.id);
      if (back && ((r.kind === "alleata" && ["nemica", "rivale"].includes(back.kind)) || (r.kind === "nemica" && back.kind === "alleata")))
        push("rischio", "FAZIONE-RAPPORTI", `${f.data.name} considera ${other.data.name} "${r.kind}", ma l'altra la considera "${back.kind}".`, [f.id, other.id], "Allinea i rapporti (o annota che è un'ostilità non reciproca).");
    }
    if (f.data.stance === "ostile" && f.data.standing > 0) push("suggerimento", "FAZIONE-REPUTAZIONE", `"${f.data.name}" è ostile ma ha reputazione positiva (${f.data.standing}).`, [f.id], "Allinea atteggiamento e reputazione.");
  }
  for (const dn of ofType("dungeon")) {
    const bad = dungeonDataErrors(dn.data);
    if (bad.length) { push("errore", "DUNGEON-DATI", `Il dungeon "${dn.data.name}" ha dati non validi: ${bad.map((x) => `${x.path}: ${x.message}`).join("; ")}.`, [dn.id], "Apri il dungeon e correggi i campi indicati (o rigeneralo)."); continue; }
    const c = dungeonConnectivity({ grid: dn.data.grid, rooms: dn.data.rooms });
    if (!c.allReachable) push("errore", "DUNGEON-STANZE-ISOLATE", `Nel dungeon "${dn.data.name}" alcune stanze non sono raggiungibili dall'ingresso: ${c.unreachable.join(", ")}.`, [dn.id], "Aggiungi un corridoio o una porta (anche segreta).");
    if (!dn.data.location) push("suggerimento", "DUNGEON-LUOGO", `Il dungeon "${dn.data.name}" non è collegato a un luogo della mappa del mondo.`, [dn.id], "Collegalo a un luogo.");
    const unlockedByClues = (dn.data.rooms ?? []).flatMap((r) => r.clues ?? []);
    for (const c2 of unlockedByClues) if (!reached.has(c2)) push("errore", "DUNGEON-INDIZIO", `Una stanza di "${dn.data.name}" contiene l'indizio "${name(c2)}", non scopribile.`, [dn.id, c2], "Rendi scopribile l'indizio.");
    if (dn.data.location && by.get(dn.data.location)?.data.access !== "pubblico" && !reached.has(dn.data.location)) push("errore", "DUNGEON-INACCESSIBILE", `Il dungeon "${dn.data.name}" è in un luogo mai accessibile.`, [dn.id, dn.data.location], "Sblocca il luogo.");
  }
  if (campaign.endLevel !== undefined) {
    const gain = campaign.endLevel - campaign.startLevel, perSession = gain / Math.max(1, ofType("session").length || campaign.sessions);
    if (perSession > 1) push("rischio", "CAMPAGNA-LIVELLI", `Si guadagnerebbero ${perSession.toFixed(1)} livelli a sessione (da ${campaign.startLevel} a ${campaign.endLevel} in ${ofType("session").length || campaign.sessions} sessioni).`, [], "Aumenta la durata o riduci il livello finale.");
    if (ofType("quest").filter((q) => q.data.kind === "principale").length === 0) push("rischio", "CAMPAGNA-PRINCIPALE", "La campagna non ha missioni principali.", [], "Crea almeno una missione principale.");
  }

  // ---- 9. testo libero: nomi citati nelle descrizioni (controllo lessicale, non semantico) ----
  {
    const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const wordRe = (n) => new RegExp(`(^|[^\\p{L}\\p{N}])${esc(n)}(?![\\p{L}\\p{N}])`, "iu");
    const textsOf = (e) => {
      const out = [];
      const walk = (v, key) => { if (typeof v === "string") { if (key !== "name") out.push(v); } else if (Array.isArray(v)) v.forEach((x) => walk(x, key)); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k); };
      walk(e.data, "");
      return out.join("\n");
    };
    const trashed = entities.filter((e) => e.deleted && (e.data.name ?? "").length >= 5);
    const npcNames = new Set(ofType("npc").map((n) => n.data.name.toLowerCase()));
    const personRe = new RegExp(`\\b(?:${[...FIRST_M, ...FIRST_F].join("|")}) (?:${SURNAMES.map(esc).join("|")})(?![\\p{L}])`, "gu");
    const deadNpcs = ofType("npc").filter((n) => n.data.status === "morto");
    for (const e of live) {
      const txt = textsOf(e);
      if (!txt) continue;
      for (const t of trashed) if (t.id !== e.id && wordRe(t.data.name).test(txt)) push("rischio", "TESTO-ELIMINATO", `Il testo di "${e.data.name}" cita "${t.data.name}", che è nel cestino.`, [e.id, t.id], "Ripristina l'elemento dal cestino oppure aggiorna il testo.");
      for (const m of new Set(txt.match(personRe) ?? [])) if (!npcNames.has(m.toLowerCase()) && !trashed.some((t) => t.data.name === m))
        push("rischio", "TESTO-NOME-SCONOSCIUTO", `Il testo di "${e.data.name}" cita "${m}", ma non esiste alcun PNG con questo nome.`, [e.id], "Crea il PNG, correggi il nome nel testo o rimuovi il riferimento.");
      if (e.type !== "npc" && e.type !== "item" && e.type !== "clue" && !(e.type === "event" && isHistoric(e)))
        for (const n of deadNpcs) if (wordRe(n.data.name).test(txt)) push("suggerimento", "TESTO-PNG-MORTO", `Il testo di "${e.data.name}" cita ${n.data.name}, che è morto: verifica che sia coerente.`, [e.id, n.id], "Riformula il testo al passato o cambia lo stato del PNG.");
    }
  }

  issues.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || a.rule.localeCompare(b.rule));
  const summary = { errore: 0, rischio: 0, suggerimento: 0 };
  for (const i of issues) summary[i.severity]++;
  return { checkedAt: new Date().toISOString(), summary, issues, reachable: [...reached] };
}
