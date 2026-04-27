#!/usr/bin/env npx tsx
/**
 * Read-only дамп одной кампании: этап, шаг, сцена, реплика, вопрос, 5 опций,
 * ветка и собранная реакция NPC из content/npc-reactions/all.json.
 *
 * Usage: npx tsx ./scripts/campaign-flow-dump.ts <campaignId>
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type { CampaignContentId } from "../questContent";
import { stepLibraryByCampaign } from "../stepLibrary";

const campaignId = (process.argv[2] ?? "").trim() as CampaignContentId;
if (!campaignId) {
  console.error("Usage: npx tsx ./scripts/campaign-flow-dump.ts <campaignId>");
  process.exit(1);
}

const steps = stepLibraryByCampaign[campaignId];
if (!steps?.length) {
  console.error(`Unknown or empty campaign: ${campaignId}`);
  process.exit(1);
}

const root = path.resolve(__dirname, "..");
const reactionsPath = path.join(root, "content", "npc-reactions", "all.json");
const reactionsRaw = fs.readFileSync(reactionsPath, "utf8");
const reactions = JSON.parse(reactionsRaw) as Record<string, Record<string, Record<string, string>>>;

const byCampaign = reactions[campaignId] ?? {};

steps.forEach((s, idx) => {
  const stage = s.stageIdx + 1;
  const step = idx + 1;
  console.log(`\n--- #${step} (этап ${stage}) ---`);
  console.log(`SCENE: ${s.scene}`);
  console.log(`LINE: ${s.opponentLine}`);
  console.log(`Q: ${s.instruction}`);
  console.log(`HINT: ${s.hint}`);
  s.options.forEach((opt, oi) => {
    const branch = s.branchEffectsByOption[oi];
    const r = byCampaign[String(idx)]?.[String(oi)] ?? "(нет в all.json)";
    console.log(`  O${oi + 1} [${branch}]: ${opt}`);
    console.log(`      R: ${r}`);
  });
});
