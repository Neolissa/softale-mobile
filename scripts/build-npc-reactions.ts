#!/usr/bin/env npx tsx
/**
 * Офлайн-сборка реакций NPC по каждому шагу и варианту ответа (без LLM).
 * Результат: content/npc-reactions/all.json — в рантайме подставляется в optionNpcReactionByIndex.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type { CampaignContentId } from "../questContent";
import { resolveNpcReactionLine, stepLibraryByCampaign } from "../stepLibrary";

type OutFile = Record<string, Record<string, Record<string, string>>>;

function build(): OutFile {
  const out: OutFile = {};
  (Object.keys(stepLibraryByCampaign) as CampaignContentId[]).forEach((cid) => {
    const entries = stepLibraryByCampaign[cid];
    out[cid] = {};
    entries.forEach((entry, idx) => {
      out[cid][String(idx)] = {};
      for (let o = 0; o < 5; o += 1) {
        const branch = entry.branchEffectsByOption[o];
        out[cid][String(idx)][String(o)] = resolveNpcReactionLine(cid, idx, o, branch, entry.opponentName);
      }
    });
  });
  return out;
}

const root = path.resolve(__dirname, "..");
const dir = path.join(root, "content", "npc-reactions");
fs.mkdirSync(dir, { recursive: true });
const payload = build();
const target = path.join(dir, "all.json");
fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`[build-npc-reactions] wrote ${path.relative(root, target)}`);
