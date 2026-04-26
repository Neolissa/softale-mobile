#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const filesToScan = [
  path.join(root, "scenarioBible.ts"),
  path.join(root, "questContent.ts"),
];

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

