#!/usr/bin/env npx tsx
/**
 * Неблокирующий отчёт: дубли сцен и реплик (opponentLine) внутри каждой кампании
 * и глобально по всему stepLibraryByCampaign.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { stepLibraryByCampaign } from "../stepLibrary";

const normalize = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");

type Ref = { campaign: string; step: number };

function collectPerCampaign(): { campaign: string; sceneDups: [string, Ref[]][]; lineDups: [string, Ref[]][] }[] {
  const out: { campaign: string; sceneDups: [string, Ref[]][]; lineDups: [string, Ref[]][] }[] = [];

  for (const [campaign, steps] of Object.entries(stepLibraryByCampaign)) {
    const sceneMap = new Map<string, Ref[]>();
    const lineMap = new Map<string, Ref[]>();
    steps.forEach((step, idx) => {
      const s = normalize(step.scene);
      const l = normalize(step.opponentLine);
      const ref: Ref = { campaign, step: idx + 1 };
      sceneMap.set(s, [...(sceneMap.get(s) ?? []), ref]);
      lineMap.set(l, [...(lineMap.get(l) ?? []), ref]);
    });
    const sceneDups = [...sceneMap.entries()].filter(([, refs]) => refs.length > 1) as [string, Ref[]][];
    const lineDups = [...lineMap.entries()].filter(([, refs]) => refs.length > 1) as [string, Ref[]][];
    if (sceneDups.length || lineDups.length) {
      out.push({ campaign, sceneDups, lineDups });
    }
  }
  return out;
}

function collectGlobalScenes(): [string, Ref[]][] {
  const map = new Map<string, Ref[]>();
  for (const [campaign, steps] of Object.entries(stepLibraryByCampaign)) {
    steps.forEach((step, idx) => {
      const s = normalize(step.scene);
      map.set(s, [...(map.get(s) ?? []), { campaign, step: idx + 1 }]);
    });
  }
  return [...map.entries()].filter(([, refs]) => refs.length > 1) as [string, Ref[]][];
}

function collectGlobalLines(): [string, Ref[]][] {
  const map = new Map<string, Ref[]>();
  for (const [campaign, steps] of Object.entries(stepLibraryByCampaign)) {
    steps.forEach((step, idx) => {
      const l = normalize(step.opponentLine);
      map.set(l, [...(map.get(l) ?? []), { campaign, step: idx + 1 }]);
    });
  }
  return [...map.entries()].filter(([, refs]) => refs.length > 1) as [string, Ref[]][];
}

const perCampaign = collectPerCampaign();
const globalScenes = collectGlobalScenes();
const globalLines = collectGlobalLines();

const lines: string[] = [];
lines.push("# Content Scene & Dialogue Duplicates Report");
lines.push("");
lines.push(`Generated at: ${new Date().toISOString()}`);
lines.push("");
lines.push(`Campaigns with internal duplicates: ${perCampaign.length}`);
lines.push(`Global duplicate scenes (cross-campaign): ${globalScenes.length}`);
lines.push(`Global duplicate opponent lines (cross-campaign): ${globalLines.length}`);
lines.push("");

if (perCampaign.length) {
  lines.push("## Per-campaign duplicates");
  lines.push("");
  perCampaign.forEach(({ campaign, sceneDups, lineDups }) => {
    lines.push(`### ${campaign}`);
    lines.push("");
    if (sceneDups.length) {
      lines.push("**Scenes:**");
      sceneDups.forEach(([text, refs], i) => {
        lines.push(`${i + 1}. ${text}`);
        lines.push(`   - ${refs.map((r) => `${r.campaign}#${r.step}`).join(", ")}`);
      });
      lines.push("");
    }
    if (lineDups.length) {
      lines.push("**Opponent lines:**");
      lineDups.forEach(([text, refs], i) => {
        lines.push(`${i + 1}. ${text}`);
        lines.push(`   - ${refs.map((r) => `${r.campaign}#${r.step}`).join(", ")}`);
      });
      lines.push("");
    }
  });
}

if (globalScenes.length) {
  lines.push("## Global duplicate scenes");
  lines.push("");
  globalScenes.slice(0, 200).forEach(([text, refs], i) => {
    lines.push(`${i + 1}. ${text}`);
    lines.push(`   - ${refs.map((r) => `${r.campaign}#${r.step}`).join(", ")}`);
  });
  if (globalScenes.length > 200) {
    lines.push("");
    lines.push(`(… ещё ${globalScenes.length - 200} групп)`);
  }
  lines.push("");
}

if (globalLines.length) {
  lines.push("## Global duplicate opponent lines");
  lines.push("");
  globalLines.slice(0, 200).forEach(([text, refs], i) => {
    lines.push(`${i + 1}. ${text}`);
    lines.push(`   - ${refs.map((r) => `${r.campaign}#${r.step}`).join(", ")}`);
  });
  if (globalLines.length > 200) {
    lines.push("");
    lines.push(`(… ещё ${globalLines.length - 200} групп)`);
  }
  lines.push("");
}

const reportPath = path.resolve(__dirname, "..", "docs", "content-scene-dialogue-duplicates-report.md");
fs.writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8");

console.log(`[content:scene-dialogue] wrote ${path.relative(path.resolve(__dirname, ".."), reportPath)}`);
console.log(`[content:scene-dialogue] campaigns with internal dups: ${perCampaign.length}`);
console.log(`[content:scene-dialogue] global scene dup groups: ${globalScenes.length}`);
console.log(`[content:scene-dialogue] global line dup groups: ${globalLines.length}`);
process.exitCode = 0;
