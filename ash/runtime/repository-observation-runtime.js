"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_SCAN = [
  "ash/runtime",
  "ash/capabilities",
  "ash/managers"
];

function collectFiles(base, dir) {
  const target = path.join(base, dir);

  if (!fs.existsSync(target)) {
    return [];
  }

  const result = [];

  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);

      if (entry.isDirectory()) {
        walk(full);
        continue;
      }

      result.push(full);
    }
  }

  walk(target);

  return result;
}

function shouldSkipFile(file) {
  const normalized = file.replace(/\\/g, "/");

  return (
    normalized.includes(".backup.") ||
    normalized.includes("/.sandbox/") ||
    normalized.endsWith("repository-observation-runtime.js")
  );
}

function detectWork(file) {
  if (shouldSkipFile(file)) {
    return [];
  }

  const text = fs.readFileSync(file, "utf8");

  const work = [];

  if (/TODO|FIXME|XXX/i.test(text)) {
    work.push("todo");
  }

  if (/throw new Error|NotImplemented|stub/i.test(text)) {
    work.push("implementation");
  }

  if (/continue_autonomous_development/.test(text)) {
    work.push("execution");
  }

  return work;
}

function observeRepository({
  projectPath = process.cwd(),
  scanTargets = DEFAULT_SCAN
} = {}) {

  const findings = [];

  for (const dir of scanTargets) {

    const files = collectFiles(projectPath, dir);

    for (const file of files) {

      const work = detectWork(file);

      if (work.length === 0) {
        continue;
      }

      findings.push({
        file: path.relative(projectPath, file),
        work,
        priority:
          work.includes("implementation")
            ? "high"
            : "normal"
      });

    }

  }

  findings.sort((a, b) => {

    if (a.priority === b.priority) return 0;

    return a.priority === "high" ? -1 : 1;

  });

  return {

    mode: "repository-observation-runtime",

    version: "ash-local-runtime-v0.2",

    success: true,

    findings,

    nextTask:

      findings.length === 0
        ? null
        : findings[0],

    observedAt: new Date().toISOString()

  };

}

module.exports = {

  observeRepository,
  shouldSkipFile

};

