const fs = require("fs");
const path = require("path");
const { generatePatch } = require("./generate-patch");
const { applySafePatch } = require("./apply-safe-patch");
const { verifyPatch } = require("./verify-patch");
const { repairPatch } = require("./repair-patch");

const testFile = "ash/capabilities/.capability-smoke-test.js";
const testPath = path.join(process.cwd(), testFile);

fs.writeFileSync(
  testPath,
  [
    "function smoke() {",
    "  return true;",
    "}",
    "",
    "module.exports = { smoke };",
    ""
  ].join("\n"),
  "utf8"
);

const instruction = {
  instructionId: "smoke-0001",
  targetFile: testFile,
  operation: "insert-after",
  anchorPattern: "function smoke() {",
  purpose: "Verify generate/apply/verify/repair capability loop."
};

const generateResult = generatePatch({ instruction });

const patchResult = applySafePatch({
  projectRoot: process.cwd(),
  patch: generateResult.patch
});

const verifyResult = verifyPatch({
  projectRoot: process.cwd(),
  files: [testFile]
});

const repairResult = repairPatch({ patchResult, verifyResult });

console.log(JSON.stringify({
  generateResult,
  patchResult,
  verifyResult,
  repairResult
}, null, 2));

if (
  !generateResult.success ||
  !patchResult.success ||
  !verifyResult.success ||
  !repairResult.success
) {
  process.exit(1);
}
