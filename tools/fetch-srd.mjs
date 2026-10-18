// Dev-time only: scarica creature SRD 5.2 da Open5e (CC BY 4.0) e salva un sottoinsieme compatto.
import fs from "node:fs";
let url = "https://api.open5e.com/v2/creatures/?document__key=srd-2024&limit=100";
const out = [];
while (url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} su ${url}`);
  const j = await r.json();
  for (const c of j.results) {
    out.push({
      key: c.key, name: c.name, type: c.type?.name ?? c.type, size: c.size?.name ?? c.size,
      cr: Number(c.challenge_rating_decimal ?? c.challenge_rating), xp: c.experience_points,
      ac: c.armor_class, hp: c.hit_points, env: (c.environments || []).map(e => e.name ?? e),
      speed: c.speed?.walk ?? null, legendary: (c.actions || []).some(a => a.action_type === "LEGENDARY_ACTION"),
    });
  }
  url = j.next;
}
fs.writeFileSync("data/srd52-creatures.json", JSON.stringify({
  source: "Open5e API v2, document srd-2024 (System Reference Document 5.2)",
  license: "CC BY 4.0 - (c) Wizards of the Coast LLC", fetched: new Date().toISOString().slice(0,10), creatures: out }, null, 0));
console.log("creature:", out.length);
