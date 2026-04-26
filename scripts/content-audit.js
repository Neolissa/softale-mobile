#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const filesToScan = [
  path.join(root, "scenarioBible.ts"),
  path.join(root, "questContent.ts"),
];
const appFilePath = path.join(root, "App.tsx");

const bannedMarkers = ["needsEditorialFill", "временный placeholder", "Контент шага в редактуре"];

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function normalizeOption(text) {
  return String(text)
    .toLowerCase()
    .replace(/[.,!?;:()[\]{}"'`«»]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractOptionArrays(content) {
  const arrays = [];
  const anchor = "options:";
  let cursor = 0;

  while (cursor < content.length) {
    const anchorIdx = content.indexOf(anchor, cursor);
    if (anchorIdx === -1) break;
    const bracketStart = content.indexOf("[", anchorIdx);
    if (bracketStart === -1) break;

    let i = bracketStart + 1;
    let depth = 1;
    let inQuote = false;
    let quote = "";
    let escaped = false;
    let chunk = "";

    while (i < content.length && depth > 0) {
      const ch = content[i];
      chunk += ch;

      if (inQuote) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === quote) {
          inQuote = false;
          quote = "";
        }
      } else {
        if (ch === '"' || ch === "'") {
          inQuote = true;
          quote = ch;
        } else if (ch === "[") {
          depth += 1;
        } else if (ch === "]") {
          depth -= 1;
        }
      }
      i += 1;
    }

    if (depth === 0) {
      arrays.push({
        start: bracketStart + 1,
        raw: chunk.slice(0, -1),
      });
    }
    cursor = i;
  }

  return arrays;
}

function extractStringsFromArray(rawArray) {
  const values = [];
  let i = 0;

  while (i < rawArray.length) {
    const ch = rawArray[i];
    if (ch !== '"' && ch !== "'") {
      i += 1;
      continue;
    }
    const quote = ch;
    i += 1;
    let value = "";
    let escaped = false;
    while (i < rawArray.length) {
      const c = rawArray[i];
      if (escaped) {
        value += c;
        escaped = false;
      } else if (c === "\\") {
        escaped = true;
      } else if (c === quote) {
        break;
      } else {
        value += c;
      }
      i += 1;
    }
    values.push(value.trim());
    i += 1;
  }
  return values;
}

function lineOf(content, index) {
  return content.slice(0, index).split("\n").length;
}

function extractObjectBlock(content, anchor) {
  const anchorIdx = content.indexOf(anchor);
  if (anchorIdx < 0) {
    return null;
  }
  const braceStart = content.indexOf("{", anchorIdx);
  if (braceStart < 0) {
    return null;
  }
  let i = braceStart + 1;
  let depth = 1;
  let inQuote = false;
  let quote = "";
  let escaped = false;
  while (i < content.length && depth > 0) {
    const ch = content[i];
    if (inQuote) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === quote) {
        inQuote = false;
        quote = "";
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = true;
      quote = ch;
    } else if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
    }
    i += 1;
  }
  if (depth !== 0) {
    return null;
  }
  return content.slice(braceStart, i);
}

function collectIconsForUniquenessAudit(content) {
  const records = [];
  const campaignBlock = extractObjectBlock(content, "const campaignLore:");
  if (campaignBlock) {
    const iconRegex = /([a-zA-Z0-9_"-]+)\s*:\s*\{[^{}]*icon:\s*"([^"]+)"/g;
    let match = iconRegex.exec(campaignBlock);
    while (match) {
      records.push({ scope: "campaign", id: match[1].replace(/"/g, ""), icon: match[2] });
      match = iconRegex.exec(campaignBlock);
    }
  }

  const courseBlock = extractObjectBlock(content, "const courseIllustrationById:");
  if (courseBlock) {
    const iconRegex = /"([^"]+)"\s*:\s*"([^"]+)"/g;
    let match = iconRegex.exec(courseBlock);
    while (match) {
      records.push({ scope: "course", id: match[1], icon: match[2] });
      match = iconRegex.exec(courseBlock);
    }
  }

  const eventBlock = extractObjectBlock(content, "const eventIllustrationById");
  if (eventBlock) {
    const iconRegex = /"([^"]+)"\s*:\s*"([^"]+)"/g;
    let match = iconRegex.exec(eventBlock);
    while (match) {
      records.push({ scope: "event", id: match[1], icon: match[2] });
      match = iconRegex.exec(eventBlock);
    }
  }

  return records;
}

function run() {
  const issues = [];

  for (const filePath of filesToScan) {
    const content = read(filePath);

    for (const marker of bannedMarkers) {
      const markerIdx = content.indexOf(marker);
      if (markerIdx >= 0) {
        issues.push({
          file: filePath,
          line: lineOf(content, markerIdx),
          type: "banned-marker",
          detail: `Найден запрещенный маркер: "${marker}"`,
        });
      }
    }

    const optionArrays = extractOptionArrays(content);
    optionArrays.forEach((entry, arrIdx) => {
      const values = extractStringsFromArray(entry.raw);
      if (!values.length) return;

      values.forEach((value, idx) => {
        if (!value.trim()) {
          issues.push({
            file: filePath,
            line: lineOf(content, entry.start),
            type: "empty-option",
            detail: `Пустая опция в массиве #${arrIdx + 1}, индекс ${idx}`,
          });
        }
      });

      const seen = new Map();
      values.forEach((value, idx) => {
        const normalized = normalizeOption(value);
        if (!normalized) return;
        if (seen.has(normalized)) {
          issues.push({
            file: filePath,
            line: lineOf(content, entry.start),
            type: "duplicate-option-in-step",
            detail: `Дублирующаяся опция в массиве #${arrIdx + 1}: "${value}" (индексы ${seen.get(normalized)} и ${idx})`,
          });
        } else {
          seen.set(normalized, idx);
        }
      });
    });
  }

  const appContent = read(appFilePath);
  const iconRecords = collectIconsForUniquenessAudit(appContent);
  const iconOwners = new Map();
  iconRecords.forEach((item) => {
    if (!item.icon) return;
    const entityId = String(item.id);
    const owner = `${item.scope}:${entityId}`;
    const prev = iconOwners.get(item.icon);
    if (!prev) {
      iconOwners.set(item.icon, { owner, entityId });
      return;
    }
    if (prev.entityId === entityId) {
      return;
    }
    issues.push({
      file: appFilePath,
      line: 1,
      type: "duplicate-card-icon",
      detail: `Иконка "${item.icon}" повторяется: ${prev.owner} и ${owner}`,
    });
  });

  if (issues.length) {
    console.error("[content:audit] FAIL");
    issues.forEach((issue, idx) => {
      console.error(
        `${idx + 1}. ${path.relative(root, issue.file)}:${issue.line} [${issue.type}] ${issue.detail}`
      );
    });
    process.exit(1);
  }

  console.log("[content:audit] OK: запрещенных маркеров и критичных дублей не найдено.");
}

run();

