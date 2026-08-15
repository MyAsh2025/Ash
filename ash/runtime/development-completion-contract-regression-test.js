"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const agents = read("AGENTS.md");
const rules = read("ash/DEVELOPMENT-RULES.md");
const verify = read("ash-dev-verify.js");

assert.match(agents, /formal existing-repair verification route/);
assert.match(agents, /Never use this route as a fallback/);
assert.match(agents, /Treat ordinary safe, in-scope operations as normal development work/);
assert.match(agents, /git reset --hard/);
assert.match(agents, /Require explicit user confirmation before publishing or materially changing external state/);
assert.match(agents, /Do not proceed automatically with an unexpected large change/);
assert.match(agents, /Never bypass, suppress, or disable an approval UI/);
assert.match(rules, /Patch-generation completion and existing-repair verification completion are distinct/);
assert.match(rules, /repository change evidence and formally registered permanent regression coverage/);
assert.match(verify, /runCoreCheck\s*\(/);
assert.match(verify, /success:\s*coreCheck\.success === true/);

console.log(JSON.stringify({
  mode: "development-completion-contract-regression-test",
  success: true,
  explicitFileContractsVerified: ["AGENTS.md", "ash/DEVELOPMENT-RULES.md", "ash-dev-verify.js"]
}, null, 2));
