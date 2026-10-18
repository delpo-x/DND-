// Esportazione leggibile: Markdown e HTML stampabile da una stessa rappresentazione a blocchi.
import { dungeonToSvg } from "./dungeon.js";

export const SRD_ATTRIBUTION =
  "Questo documento utilizza materiale dal System Reference Document 5.2 (SRD 5.2) di Wizards of the Coast LLC, disponibile su https://dnd.wizards.com/resources/systems-reference-document ed è distribuito con licenza Creative Commons Attribution 4.0 International (CC BY 4.0). Dati creature ottenuti tramite Open5e. Progetto non ufficiale, non affiliato né approvato da Wizards of the Coast.";

// I dati salvati da versioni precedenti possono non rispettare i vincoli attuali: l'esportazione non deve mai fallire per questo.
const encounterText = (enc, withCr = true) => {
  if (!enc || !Array.isArray(enc.creatures)) return enc ? "(dati dell'incontro non validi)" : "";
  const list = enc.creatures.map((c) => `${c.count}× ${c.name}${withCr && c.cr !== undefined ? ` (GS ${c.cr})` : ""}`).join(", ");
  return `${list} — ${enc.totalXp ?? "?"}/${enc.budget ?? "?"} PE${enc.difficulty ? ` (${enc.difficulty})` : ""}`;
};

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function buildBlocks(campaign, entities, opts = {}) {
  const live = entities.filter((e) => !e.deleted);
  const by = new Map(live.map((e) => [e.id, e]));
  const nm = (id) => (id && by.get(id)?.data.name) || "—";
  const of = (t) => live.filter((e) => e.type === t).sort((a, b) => (a.data.number ?? a.data.day ?? 0) - (b.data.number ?? b.data.day ?? 0) || a.data.name.localeCompare(b.data.name));
  const B = [];
  const h = (l, t) => B.push({ h: l, t });
  const p = (t) => t && B.push({ p: t });
  const ul = (items) => items?.length && B.push({ ul: items.map(String) });
  const kv = (pairs) => ul(pairs.filter(([, v]) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length)).map(([k, v]) => `**${k}:** ${Array.isArray(v) ? v.join("; ") : v}`));

  h(1, campaign.title);
  kv([["Ambientazione", campaign.setting], ["Tono", campaign.tone], ["Pericolo", campaign.danger], ["Giocatori", campaign.players],
    ["Livelli", `${campaign.startLevel} → ${campaign.endLevel}`], ["Durata indicativa", `${campaign.sessions} sessioni`], ["Giorno corrente", campaign.currentDay],
    ["Seed", campaign.seed], ["Regole", campaign.rulesVersion]]);
  h(2, "Premessa e conflitto"); p(campaign.premise); p(campaign.centralConflict);
  h(2, "Stato attuale del mondo"); p(campaign.worldState);

  h(2, "Sessioni, atti e capitoli");
  ul(of("session").map((s) => `**${s.data.number}. ${s.data.name}** (atto ${s.data.act ?? "?"}, cap. ${s.data.chapter ?? "?"})${s.data.played ? " [giocata]" : ""} — ${s.data.summary}${(s.data.quests ?? []).length ? ` Missioni: ${s.data.quests.map(nm).join(", ")}.` : ""}`));

  h(2, "Missioni");
  for (const q of of("quest").sort((a, b) => (a.data.act ?? 9) - (b.data.act ?? 9) || (a.data.chapter ?? 9) - (b.data.chapter ?? 9))) {
    const d = q.data;
    h(3, `${d.name} [${d.kind}${d.act ? `, atto ${d.act}` : ""}]`);
    p(d.premise);
    kv([["Id", q.id], ["Committente", nm(d.giver)], ["Obiettivo", d.objective],
      ["Prerequisiti", (d.prerequisites ?? []).map((x) => nm(x.target))], ["Luoghi", (d.locations ?? []).map(nm)], ["PNG", (d.npcs ?? []).map(nm)],
      ["Indizi offerti", (d.clues ?? []).map(nm)], ["Indizi necessari", (d.requiredClues ?? []).map(nm)],
      ["Ostacoli", d.obstacles], ["Svolte", d.twists],
      ["Ricompense", (d.rewards ?? []).map((r) => `${r.kind}${r.text ? ": " + r.text : ""}`)], ["Conseguenze", d.consequences], ["Stato", d.status]]);
    if ((d.outcomes ?? []).length) { p("**Possibili esiti**"); ul(d.outcomes.map((o) => `**${o.label}** — ${o.description}${(o.effects ?? []).length ? ` (effetti: ${o.effects.map((e) => `${e.kind} ${nm(e.target)} ${e.value || nm(e.valueRef)}`.trim()).join("; ")})` : ""}`)); }
  }

  h(2, "PNG");
  for (const n of of("npc")) {
    const d = n.data;
    h(3, `${d.name} — ${[d.species, d.role].filter(Boolean).join(", ")} [${d.status}]`);
    p(d.description); p(d.personality);
    kv([["Luogo", nm(d.location)], ["Fazioni", (d.factions ?? []).map(nm)], ["Motivazioni", d.motivations], ["Obiettivi", d.goals], ["Paure", d.fears], ["Conflitti", d.conflicts],
      ["Informazioni note", (d.knowledge ?? []).map((k) => `${k.fact}${k.hidden ? " (nascosta)" : ""}${k.source ? ` [fonte: ${nm(k.source)}]` : ""}`)],
      ["Segreti", d.secrets], ["Bugie", d.lies],
      ["Relazioni", (d.relationships ?? []).map((r) => `${r.kind} con ${nm(r.npc)}${r.note ? " (" + r.note + ")" : ""}`)],
      ["Comportamento", (d.behaviors ?? []).map((b) => `se ${b.situation}: ${b.reaction}`)], ["Dialoghi", d.dialogues],
      ["Spostamenti", (d.schedule ?? []).map((s) => `giorni ${s.fromDay}…${s.toDay}: ${nm(s.location)}`)],
      ["Combattimento", (d.combat ?? []).map((c) => `${c.monsterKey || "da definire"} ${c.note ?? ""}`)]]);
  }

  h(2, "Fazioni");
  for (const f of of("faction")) {
    const d = f.data;
    h(3, `${d.name} [${d.stance}, reputazione ${d.standing}]`); p(d.description);
    kv([["Capo", nm(d.leader)], ["Sede", nm(d.headquarters)], ["Obiettivi", d.goals], ["Risorse", d.resources], ["Territori", (d.territories ?? []).map(nm)], ["Rapporti", (d.relations ?? []).map((r) => `${r.kind}: ${nm(r.faction)}`)]]);
  }

  h(2, "Mondo e luoghi");
  for (const l of of("location")) {
    const d = l.data;
    h(3, `${d.name} (${d.kind}${d.parent ? ", in " + nm(d.parent) : ""}) [${d.access}]`); p(d.description);
    kv([["Storia", d.history], ["Cultura", d.culture], ["Economia", d.economy], ["Politica", d.politics], ["Risorse", d.resources], ["Leggende", d.legends],
      ["Sbloccato da", d.unlockedBy ? nm(d.unlockedBy) : ""], ["Percorsi", (d.connections ?? []).map((c) => `${nm(c.to)} (${c.via || "—"}, ${c.days ?? "?"} gg)`)]]);
  }

  h(2, "Misteri e indizi");
  for (const m of of("mystery")) {
    const d = m.data;
    h(3, d.name); kv([["Domanda", d.question], ["Soluzione (solo DM)", d.solution], ["Responsabile", nm(d.culprit)], ["Indizi veritieri", (d.clues ?? []).map(nm)], ["False piste", (d.redHerrings ?? []).map(nm)]]);
  }
  for (const c of of("clue")) {
    const d = c.data;
    h(4, `${d.name}${d.truthful ? "" : " [falsa pista]"}`); p(d.text);
    kv([["Dove", nm(d.foundAtLocation)], ["Da chi", nm(d.foundWithNpc)], ["In", nm(d.foundInItem)], ["Prova", d.check], ["Dopo", (d.requires ?? []).map(nm)], ["Smentita da", d.debunkedBy ? nm(d.debunkedBy) : ""]]);
  }

  h(2, "Oggetti");
  ul(of("item").map((i) => `**${i.data.name}** (${i.data.kind}) — ${i.data.description} [origine: ${nm(i.data.origin)}${i.data.holder ? "; posseduto da " + nm(i.data.holder) : ""}]`));

  h(2, "Cronologia degli eventi");
  ul(of("event").sort((a, b) => a.data.day - b.data.day).map((e) => `**Giorno ${e.data.day}** — ${e.data.name} [${e.data.kind}${e.data.happened ? ", accaduto" : ""}] a ${nm(e.data.location)}${(e.data.participants ?? []).length ? " con " + e.data.participants.map(nm).join(", ") : ""}. ${e.data.description}`));

  for (const dn of of("dungeon")) {
    const d = dn.data;
    h(2, `Dungeon: ${d.name}`);
    kv([["Seed", d.seed], ["Livello del gruppo", d.partyLevel], ["Luogo", nm(d.location)], ["Dimensione", `${d.width}×${d.height}`]]);
    if (Array.isArray(d.grid)) B.push({ pre: d.grid.join("\n") });
    p("Legenda: # roccia, . pavimento, + porta, S porta segreta.");
    (d.rooms ?? []).forEach((r, i) => {
      h(4, `${i + 1}. ${r.name} [${r.kind}]`); p(r.description);
      kv([["Trappola", r.trap], ["Enigma", r.puzzle], ["Segreto", r.secret], ["Tesoro", r.treasure], ["Ambiente", r.environment],
        ["Incontro", encounterText(r.encounter)],
        ["Evento", r.event ? nm(r.event) : ""], ["Indizi", (r.clues ?? []).map(nm)], ["Note", r.notes]]);
    });
  }

  const trk = opts.tracker;
  if (trk?.combatants?.length) {
    h(2, "Combattimento in corso");
    p(`Round ${trk.round}. In ordine di iniziativa (▶ = di turno):`);
    ul(trk.combatants.map((c, i) => `${i === trk.turn ? "▶ " : ""}**${c.name}**${c.kind === "pg" ? " (PG)" : ""} — iniziativa ${c.initiative}, PF ${c.hp}/${c.maxHp}${c.ac != null ? `, CA ${c.ac}` : ""}${c.conditions?.length ? `, condizioni: ${c.conditions.join(", ")}` : ""}${c.notes ? ` — ${c.notes}` : ""}`));
  }

  h(2, "Fonti e licenze"); p(SRD_ATTRIBUTION);
  return B;
}

/** Scheda di una singola sessione, da stampare e tenere dietro lo schermo del DM (vedi brief.js). */
export function sessionBlocks(brief, entities) {
  const by = new Map(entities.filter((e) => !e.deleted).map((e) => [e.id, e]));
  const nm = (id) => (id && by.get(id)?.data.name) || "—";
  const { session: s, campaign: c } = brief;
  const B = [];
  const h = (l, t) => B.push({ h: l, t });
  const p = (t) => t && B.push({ p: t });
  const ul = (items) => items?.length && B.push({ ul: items.map(String) });
  const kv = (pairs) => ul(pairs.filter(([, v]) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length)).map(([k, v]) => `**${k}:** ${Array.isArray(v) ? v.join("; ") : v}`));

  h(1, `Sessione ${s.data.number}: ${s.data.name}`);
  kv([["Campagna", c.title], ["Atto", s.data.act], ["Capitolo", s.data.chapter], ["Giorno di campagna", c.currentDay], ["Giocatori", c.players], ["Stato", s.data.played ? "giocata" : "da giocare"]]);
  p(s.data.summary);
  if (s.data.notes) { p("**Note del DM**"); p(s.data.notes); }

  h(2, "Missioni");
  if (!brief.quests.length) p("Nessuna missione collegata alla sessione.");
  for (const q of brief.quests) {
    const d = q.data;
    h(3, `${d.name} [${d.kind}, ${d.status}]`);
    p(d.premise);
    kv([["Obiettivo", d.objective], ["Committente", d.giver ? nm(d.giver) : ""], ["Ostacoli", d.obstacles], ["Svolte", d.twists],
      ["Indizi necessari", (d.requiredClues ?? []).map(nm)], ["Esiti", (d.outcomes ?? []).map((o) => `${o.label}${o.description ? ": " + o.description : ""}`)],
      ["Ricompense", (d.rewards ?? []).map((r) => `${r.kind}${r.text ? ": " + r.text : r.item ? ": " + nm(r.item) : ""}`)]]);
  }

  h(2, "Scene e luoghi");
  if (!brief.locations.length) p("Nessun luogo collegato.");
  for (const l of brief.locations) {
    const d = l.data;
    h(3, `${d.name}${d.access !== "pubblico" ? ` [${d.access}]` : ""}`);
    p(d.description);
    const here = brief.npcs.filter((n) => n.where === l.id).map((n) => n.entity.data.name);
    const dn = brief.dungeons.filter((x) => x.data.location === l.id).map((x) => `${x.data.name} (${(x.data.rooms ?? []).length} stanze)`);
    kv([["PNG presenti oggi", here], ["Dungeon", dn], ["Sbloccato da", d.unlockedBy ? nm(d.unlockedBy) : ""], ["Percorsi", (d.connections ?? []).map((x) => `${nm(x.to)} (${x.days ?? "?"} gg)`)]]);
  }

  h(2, "PNG");
  if (!brief.npcs.length) p("Nessun PNG collegato.");
  for (const { entity: n, where } of brief.npcs) {
    const d = n.data;
    h(3, `${d.name} — ${[d.species, d.role].filter(Boolean).join(", ")}${d.status !== "vivo" ? ` [${d.status}]` : ""}`);
    p(d.personality);
    kv([["Dove si trova", nm(where)], ["Vuole", [...(d.motivations ?? []), ...(d.goals ?? [])]],
      ["Sa", (d.knowledge ?? []).map((k) => `${k.fact}${k.hidden ? ` (nascosta${k.revealedBy ? `, rivelata da ${nm(k.revealedBy)}` : ""})` : ""}`)],
      ["Mente su", d.lies], ["Comportamento", (d.behaviors ?? []).map((b) => `se ${b.situation}: ${b.reaction}`)], ["Battute", d.dialogues],
      ["Combattimento", (d.combat ?? []).map((x) => `${x.monsterKey || "da definire"}${x.note ? " — " + x.note : ""}`)]]);
  }

  h(2, "Indizi ottenibili");
  if (!brief.clues.length) p("Nessun indizio raggiungibile da questa sessione.");
  ul(brief.clues.map(({ entity: x, blockedBy, after }) => {
    const d = x.data;
    const src = [d.foundAtLocation && `in ${nm(d.foundAtLocation)}`, d.foundWithNpc && `da ${nm(d.foundWithNpc)}`, d.foundInItem && `in ${nm(d.foundInItem)}`].filter(Boolean).join(", ") || "senza fonte";
    return `**${d.name}**${d.truthful ? "" : " [falsa pista]"} (${src}${d.check ? `; prova: ${d.check}` : ""})${blockedBy.length ? ` — non ancora accessibile: serve ${blockedBy.map(nm).join(", ")}` : ""}${after.length ? ` — dopo ${after.map(nm).join(", ")}` : ""}: ${d.text}`;
  }));

  h(2, "Eventi della sessione");
  if (!brief.events.length) p("Nessun evento collegato.");
  ul(brief.events.map((e) => `**Giorno ${e.data.day}** — ${e.data.name}${e.data.happened ? " [accaduto]" : ""}${e.data.location ? ` a ${nm(e.data.location)}` : ""}${e.data.trigger ? `. Innesco: ${e.data.trigger}` : ""}. ${e.data.description ?? ""}`));

  h(2, "Prossimi eventi della campagna");
  if (!brief.upcoming.length) p("Nessun evento futuro in programma.");
  ul(brief.upcoming.map((e) => `**Giorno ${e.data.day}** — ${e.data.name}${e.data.location ? ` a ${nm(e.data.location)}` : ""}${e.data.trigger ? ` (innesco: ${e.data.trigger})` : ""}`));

  h(2, "Fonti e licenze"); p(SRD_ATTRIBUTION);
  return B;
}
export const sessionToMarkdown = (brief, entities) => blocksToMarkdown(sessionBlocks(brief, entities));
export const sessionToHtml = (brief, entities) => blocksToHtml(sessionBlocks(brief, entities), `Sessione ${brief.session.data.number}: ${brief.session.data.name}`, { compact: true });

const inlineMd = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

export function blocksToMarkdown(blocks) {
  return blocks.map((b) => {
    if (b.h) return `${"#".repeat(b.h)} ${b.t}\n`;
    if (b.p) return `${b.p}\n`;
    if (b.ul) return b.ul.map((x) => `- ${x}`).join("\n") + "\n";
    if (b.pre) return "```\n" + b.pre + "\n```\n";
    return "";
  }).join("\n");
}

export function blocksToHtml(blocks, title, { compact = false } = {}) {
  const body = blocks.map((b) => {
    if (b.h) return `<h${b.h}>${esc(b.t)}</h${b.h}>`;
    if (b.p) return `<p>${inlineMd(b.p)}</p>`;
    if (b.ul) return `<ul>${b.ul.map((x) => `<li>${inlineMd(x)}</li>`).join("")}</ul>`;
    if (b.pre) return `<pre>${esc(b.pre)}</pre>`;
    return "";
  }).join("\n");
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
body{font-family:Georgia,serif;max-width:800px;margin:2rem auto;padding:0 1rem;line-height:1.5;color:#222}
h1,h2,h3,h4{font-family:Georgia,serif}h2{border-bottom:2px solid #8a5a2b;padding-bottom:.2rem;margin-top:2rem}
pre{font-family:Consolas,monospace;font-size:9px;line-height:1;background:#f4efe3;padding:8px;overflow:auto}
h3{break-after:avoid}li,p{break-inside:avoid}${compact
  ? "body{font-size:11pt;line-height:1.35}h2{margin-top:1.2rem}h3{margin:.8rem 0 .2rem}ul{margin:.2rem 0}@media print{body{margin:0;max-width:none;font-size:10pt}}"
  : "@media print{body{margin:0;max-width:none}h2{break-before:page}h1+ul+h2{break-before:avoid}}"}
</style></head><body>${body}</body></html>`;
}

export function campaignToMarkdown(campaign, entities, opts) { return blocksToMarkdown(buildBlocks(campaign, entities, opts)); }
export function campaignToHtml(campaign, entities, opts) { return blocksToHtml(buildBlocks(campaign, entities, opts), campaign.title); }

export function dungeonExport(dungeonEntity) {
  const d = dungeonEntity.data;
  const lines = [`# ${d.name}`, "", `Seed: \`${d.seed}\` — Livello gruppo: ${d.partyLevel ?? "?"}`, "", "```", ...(d.grid ?? []), "```", ""];
  (d.rooms ?? []).forEach((r, i) => {
    lines.push(`## ${i + 1}. ${r.name} (${r.kind})`, r.description ?? "");
    for (const [k, l] of [["trap", "Trappola"], ["puzzle", "Enigma"], ["secret", "Segreto"], ["treasure", "Tesoro"], ["environment", "Ambiente"], ["notes", "Note"]]) if (r[k]) lines.push(`- **${l}:** ${r[k]}`);
    if (r.encounter) lines.push(`- **Incontro:** ${encounterText(r.encounter, false)}`);
    lines.push("");
  });
  lines.push("---", SRD_ATTRIBUTION);
  return { svg: dungeonToSvg(d), markdown: lines.join("\n") };
}
