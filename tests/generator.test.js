import test from "node:test";
import assert from "node:assert/strict";
import { generateCampaignBundle, regenerateField } from "../src/gen-det.js";
import { generateNpc, generateRandomEvent, generateLocation } from "../src/gen-extra.js";
import { checkCoherence } from "../src/coherence.js";
import { memStore, genInto, ents } from "./helpers.js";

test("generatore: stesso seed => stesso risultato; seed diverso => diverso", () => {
  const a = generateCampaignBundle({ seed: "abc" }), b = generateCampaignBundle({ seed: "abc" }), c = generateCampaignBundle({ seed: "xyz" });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.entities.map((e) => e.data.name), c.entities.map((e) => e.data.name));
});

test("generatore: ogni tema produce una campagna importabile, senza errori né rischi di coerenza", () => {
  for (const theme of ["culto", "intrigo", "miniera", "peste", "fate", "pirati", "drago"]) {
    for (const seed of ["s1", "s2", "s3"]) {
      const s = memStore();
      const { campaignId } = genInto(s, { seed, themeId: theme });
      const r = checkCoherence(s.getCampaign(campaignId), s.listEntities(campaignId));
      assert.deepEqual(r.summary, { errore: 0, rischio: 0, suggerimento: 0 }, `${theme}/${seed}: ${JSON.stringify(r.issues.map((i) => i.message))}`);
    }
  }
});

test("generatore: missioni con obiettivo, esiti e indizi verificabili; misteri con >=3 indizi veri e una falsa pista", () => {
  const s = memStore();
  const { campaignId } = genInto(s, { seed: "q" });
  const quests = ents(s, campaignId, "quest");
  assert.ok(quests.length >= 6);
  for (const q of quests) {
    assert.ok(q.data.objective, q.data.name);
    assert.ok(q.data.outcomes.length >= 1, q.data.name);
    assert.ok(q.data.giver);
  }
  const clues = ents(s, campaignId, "clue");
  assert.ok(clues.some((c) => c.data.truthful === false), "serve almeno una falsa pista");
  assert.ok(clues.filter((c) => c.data.truthful).length >= 3);
  assert.equal(ents(s, campaignId, "mystery").length >= 1, true);
});

test("generatore: parametri rispettati (sessioni, livelli)", () => {
  const s = memStore();
  const { campaignId } = genInto(s, { seed: "p", sessions: 5, startLevel: 3, endLevel: 7 });
  assert.equal(ents(s, campaignId, "session").length, 5);
  const c = s.getCampaign(campaignId);
  assert.equal(c.startLevel, 3);
  assert.equal(c.endLevel, 7);
});

test("generatori extra: PNG, evento, luogo deterministici e validi contro lo schema", () => {
  const s = memStore();
  const c = s.createCampaign({ title: "X" });
  assert.deepEqual(generateNpc({ seed: 5 }), generateNpc({ seed: 5 }));
  const npc = s.createEntity(c.id, "npc", generateNpc({ seed: 5 }));
  s.createEntity(c.id, "event", generateRandomEvent({ seed: 5 }));
  const loc = s.createEntity(c.id, "location", generateLocation({ seed: 5 }));
  assert.ok(npc.data.motivations.length >= 1 && npc.data.secrets !== undefined);
  assert.ok(loc.data.name);
});

test("rigenerazione di un campo: cambia solo quel campo e lascia intatto il resto", () => {
  const s = memStore();
  const { campaignId } = genInto(s, { seed: "r" });
  const npc = ents(s, campaignId, "npc")[0];
  const before = JSON.stringify(npc.data);
  const val = regenerateField(npc, "personality", "altro-seed");
  assert.equal(typeof val, "string");
  s.updateEntity(npc.id, { personality: val });
  const after = s.getEntity(npc.id).data;
  const { personality: p1, ...r1 } = JSON.parse(before), { personality: p2, ...r2 } = after;
  assert.deepEqual(r1, r2);
});

test("generatore: nessuna preposizione non articolata (di il, a la, da i…) né segnaposto residui in tutti i temi", () => {
  const bad = /\b(di|a|da|in|su) (il|lo|la|i|gli|le)\b |\{[a-zA-Z.]+\}|\[[a-z]\|[a-z]\]|undefined|\[object/;
  for (const themeId of ["culto", "intrigo", "miniera", "peste", "fate", "pirati", "drago"]) {
    for (const seed of ["g1", "g2", "g3"]) {
      const b = generateCampaignBundle({ seed, themeId });
      const texts = [];
      const walk = (v) => { if (typeof v === "string") texts.push(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") Object.values(v).forEach(walk); };
      walk(b.campaign); b.entities.forEach((e) => { if (e.type !== "dungeon") walk(e.data); });
      for (const t of texts) assert.ok(!bad.test(t + " "), `${themeId}/${seed}: «${t.slice(0, 160)}»`);
    }
  }
});
