"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const agents = read("AGENTS.md");
const rules = read("ash/DEVELOPMENT-RULES.md");
const verify = read("ash-dev-verify.js");
const migration = read("ASH-MIGRATION-MASTER.md");

assert.match(agents, /formal existing-repair verification route/);
assert.match(agents, /Never use this route as a fallback/);
assert.match(agents, /Treat ordinary safe, in-scope operations as normal development work/);
assert.match(agents, /git reset --hard/);
assert.match(agents, /Require explicit user confirmation before publishing or materially changing external state/);
assert.match(agents, /Do not proceed automatically with an unexpected large change/);
assert.match(agents, /Never bypass, suppress, or disable an approval UI/);
assert.match(agents, /explicitly assess whether `ASH-MIGRATION-MASTER\.md` must be updated/);
assert.match(rules, /Patch-generation completion and existing-repair verification completion are distinct/);
assert.match(rules, /repository change evidence and formally registered permanent regression coverage/);
assert.match(verify, /runCoreCheck\s*\(/);
assert.match(verify, /success:\s*coreCheck\.success === true/);
assert.match(migration, /single canonical entry document/);
assert.match(migration, /CURRENTLY PENDING/);
assert.match(migration, /Never store an API key, token, password, or other secret value/);
assert.match(migration, /node ash-controller\.js --stop/);
assert.match(migration, /At every checkpoint that changes architecture/);

console.log(JSON.stringify({
  mode: "development-completion-contract-regression-test",
  success: true,
  explicitFileContractsVerified: [
    "AGENTS.md",
    "ASH-MIGRATION-MASTER.md",
    "ash/DEVELOPMENT-RULES.md",
    "ash-dev-verify.js"
  ]
}, null, 2));
