// Rigenera la cartella examples/ in modo riproducibile (database temporaneo, seed fisso).
// Uso: node tools/make-examples.js
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "../src/db.js";
import { Store } from "../src/store.js";
import { generateCampaignBundle } from "../src/gen-det.js";
import { checkCoherence } from "../src/coherence.js";
import { campaignToMarkdown, campaignToHtml, dungeonExport } from "../src/export.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "..", "examples");
fs.mkdirSync(out, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dcs-ex-"));
const store = new Store(openDb(":memory:"), { backupDir: path.join(tmp, "backups") });

const bundle = generateCampaignBundle({ seed: "esempio-1", themeId: "culto", tone: "orrore gotico", sessions: 8, startLevel: 1, endLevel: 5, players: 4 });
const { campaignId } = store.importBundle({ campaign: bundle.campaign, entities: bundle.entities }, { source: "generatore deterministico" });
const campaign = store.getCampaign(campaignId);
const entities = store.listEntities(campaignId);

const write = (name, text) => fs.writeFileSync(path.join(out, name), text, "utf8");
write("campagna-esempio.json", JSON.stringify(store.exportPayload(campaignId), null, 2));
write("campagna-esempio.md", campaignToMarkdown(campaign, entities));
write("campagna-esempio.html", campaignToHtml(campaign, entities));

const backup = store.createBackup(campaignId, "esempio");
fs.copyFileSync(path.join(tmp, "backups", backup.file), path.join(out, "backup-esempio.json"));

const dungeon = entities.find((e) => e.type === "dungeon");
if (dungeon) {
  const d = dungeonExport(dungeon);
  write("dungeon-esempio.md", d.markdown);
  write("dungeon-esempio.svg", d.svg);
}

const report = checkCoherence(campaign, entities);
write("rapporto-coerenza-esempio.json", JSON.stringify(report, null, 2));
const counts = Object.fromEntries(Object.entries(Object.groupBy(entities, (e) => e.type)).map(([k, v]) => [k, v.length]));
console.log(`Esempi scritti in ${out}`);
console.log(`Campagna: ${campaign.title} — ${entities.length} elementi`, counts);
console.log("Coerenza:", report.summary);
fs.rmSync(tmp, { recursive: true, force: true });
