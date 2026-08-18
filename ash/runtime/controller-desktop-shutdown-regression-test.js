"use strict";

const assert = require("assert");
const fs = require("fs");

const source = fs.readFileSync("./PC-Ash-Desktop-Controller.ps1", "utf8");

assert.match(source, /ClosingRequested/);
assert.match(source, /\.HasExited/);
assert.match(source, /eventArgs\.Cancel\s*=\s*\$true/);
assert.match(source, /StandardInput\.WriteLine\('exit'\)/);
assert.doesNotMatch(
  source,
  /\.Kill\s*\(/,
  "Desktop Controller must not force-kill an active autonomous cycle."
);
assert.doesNotMatch(
  source,
  /WaitForExit\(3000\)/,
  "Desktop Controller must not impose the former three-second shutdown deadline."
);

console.log(JSON.stringify({
  mode: "controller-desktop-shutdown-regression-test",
  success: true,
  waitsForControllerExit: true,
  forceKillRemoved: true
}, null, 2));
