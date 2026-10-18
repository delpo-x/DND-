import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb } from "../src/db.js";
import { Store } from "../src/store.js";
import { generateCampaignBundle } from "../src/gen-det.js";

export const tmpDir = (p = "dcs-") => fs.mkdtempSync(path.join(os.tmpdir(), p));
export function memStore() {
  const dir = tmpDir();
  return new Store(openDb(":memory:"), { backupDir: path.join(dir, "backups") });
}
export function genInto(store, params = { seed: "t1" }) {
  const b = generateCampaignBundle(params);
  const r = store.importBundle({ campaign: b.campaign, entities: b.entities });
  return { campaignId: r.campaignId, ids: r.ids, bundle: b };
}
export const ents = (s, cid, type) => s.listEntities(cid, { type });
export const byName = (s, cid, type, frag) => ents(s, cid, type).find((e) => e.data.name.includes(frag));
