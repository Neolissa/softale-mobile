#!/usr/bin/env npx tsx
import * as fs from 'node:fs';
import * as path from 'node:path';
import { stepLibraryByCampaign } from '../stepLibrary';

const normalize = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ');
const qMap = new Map<string, string[]>();
const oMap = new Map<string, string[]>();

for (const [campaign, steps] of Object.entries(stepLibraryByCampaign)) {
  steps.forEach((step, idx) => {
    const q = normalize(step.instruction);
    qMap.set(q, [...(qMap.get(q) ?? []), `${campaign}#${idx + 1}`]);
    step.options.forEach((opt, oi) => {
      const key = normalize(opt);
      oMap.set(key, [...(oMap.get(key) ?? []), `${campaign}#${idx + 1}.o${oi + 1}`]);
    });
  });
}

const qDup = [...qMap.entries()].filter(([, origins]) => origins.length > 1);
const oDup = [...oMap.entries()].filter(([, origins]) => origins.length > 1);

const lines: string[] = [];
lines.push('# Content Duplicates Report');
lines.push('');
lines.push(`Generated at: ${new Date().toISOString()}`);
lines.push('');
lines.push(`Question duplicates: ${qDup.length}`);
lines.push(`Option duplicates: ${oDup.length}`);
lines.push('');

if (qDup.length) {
  lines.push('## Duplicate Questions');
  lines.push('');
  qDup.forEach(([text, origins], i) => {
    lines.push(`${i + 1}. ${text}`);
    lines.push(`   - ${origins.join(', ')}`);
  });
  lines.push('');
}

if (oDup.length) {
  lines.push('## Duplicate Options');
  lines.push('');
  oDup.forEach(([text, origins], i) => {
    lines.push(`${i + 1}. ${text}`);
    lines.push(`   - ${origins.join(', ')}`);
  });
  lines.push('');
}

const reportPath = path.resolve(__dirname, '..', 'docs', 'content-duplicates-report.md');
fs.writeFileSync(reportPath, `${lines.join('\n')}\n`, 'utf8');

console.log(`[content:duplicates] wrote ${path.relative(path.resolve(__dirname, '..'), reportPath)}`);
console.log(`[content:duplicates] question duplicates: ${qDup.length}`);
console.log(`[content:duplicates] option duplicates: ${oDup.length}`);
process.exitCode = 0;
