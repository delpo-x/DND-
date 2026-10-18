// Riepilogo "al tavolo" di una sessione: tutto ciò che serve al DM mentre gioca, ricavato dai collegamenti tra gli elementi.
// Usato dalla modalità al tavolo dell'interfaccia e dalla scheda stampabile della sessione (export.js).
import { AppError } from "./store.js";

/** Luogo in cui si trova un PNG in un dato giorno: spostamento in corso, altrimenti luogo abituale. */
export function npcLocationOn(npc, day) {
  const s = (npc.data.schedule ?? []).find((x) => x.fromDay <= day && day <= x.toDay);
  return s?.location ?? npc.data.location ?? null;
}

/** Sessione corrente: la prima non giocata in ordine di numero; se sono tutte giocate, l'ultima. null se non ce ne sono. */
export function currentSession(entities) {
  const ss = entities.filter((e) => e.type === "session" && !e.deleted).sort((a, b) => a.data.number - b.data.number);
  return ss.find((s) => !s.data.played) ?? ss.at(-1) ?? null;
}

const uniq = (xs) => [...new Set(xs.filter(Boolean))];

/**
 * Costruisce il riepilogo della sessione sessionId.
 * - missioni ed eventi della sessione;
 * - luoghi toccati (dalle missioni, dagli eventi e dai dungeon collegati);
 * - PNG presenti: committenti, PNG delle missioni, partecipanti agli eventi e chi si trova in quei luoghi il giorno corrente;
 * - indizi ottenibili in quei luoghi, da quei PNG o offerti dalle missioni, con i requisiti non ancora soddisfatti;
 * - prossimi eventi della campagna non ancora accaduti (dal giorno corrente in poi).
 */
export function sessionBrief(campaign, entities, sessionId) {
  const live = entities.filter((e) => !e.deleted);
  const by = new Map(live.map((e) => [e.id, e]));
  const session = by.get(sessionId);
  if (!session || session.type !== "session") throw new AppError("Sessione non trovata", 404);
  const day = campaign.currentDay ?? 0;
  const s = session.data;
  const get = (ids, type) => uniq(ids).map((id) => by.get(id)).filter((e) => e && (!type || e.type === type));

  const quests = get(s.quests ?? [], "quest");
  const events = get(s.events ?? [], "event").sort((a, b) => a.data.day - b.data.day);
  const locIds = uniq([...quests.flatMap((q) => q.data.locations ?? []), ...events.map((e) => e.data.location)]);
  const dungeons = live.filter((d) => d.type === "dungeon" && locIds.includes(d.data.location));
  const locations = get(locIds, "location");

  const npcIds = uniq([
    ...quests.flatMap((q) => [q.data.giver, ...(q.data.npcs ?? [])]),
    ...events.flatMap((e) => e.data.participants ?? []),
    ...live.filter((n) => n.type === "npc" && locIds.includes(npcLocationOn(n, day))).map((n) => n.id),
  ]);
  const npcs = get(npcIds, "npc").map((n) => ({ entity: n, where: npcLocationOn(n, day) }));

  const clueIds = uniq([
    ...quests.flatMap((q) => [...(q.data.clues ?? []), ...(q.data.requiredClues ?? [])]),
    ...live.filter((c) => c.type === "clue" && (locIds.includes(c.data.foundAtLocation) || npcIds.includes(c.data.foundWithNpc))).map((c) => c.id),
  ]);
  // Requisito non soddisfatto: missione non completata o evento non accaduto. I requisiti su altri indizi si mostrano come "dopo".
  const unmet = (ids) => get(ids ?? []).filter((r) => (r.type === "quest" && r.data.status !== "completata") || (r.type === "event" && !r.data.happened));
  const clues = get(clueIds, "clue").map((c) => ({ entity: c, blockedBy: unmet(c.data.requires).map((r) => r.id), after: get(c.data.requires ?? [], "clue").map((r) => r.id) }));

  const upcoming = live.filter((e) => e.type === "event" && !e.data.happened && e.data.day >= day)
    .sort((a, b) => a.data.day - b.data.day || a.data.name.localeCompare(b.data.name, "it")).slice(0, 6);

  return { campaign: { id: campaign.id, title: campaign.title, currentDay: day, players: campaign.players }, session, quests, events, locations, dungeons, npcs, clues, upcoming };
}
