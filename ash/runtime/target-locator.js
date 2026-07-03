const fs = require("fs");
const path = require("path");

function findAnchorsInFile(filePath, patterns = []) {
  if (!fs.existsSync(filePath)) {
    return {
      filePath,
      exists: false,
      anchors: []
    };
  }

  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);

  const anchors = [];

  for (const pattern of patterns) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(pattern)) {
        anchors.push({
          pattern,
          line: i + 1,
          text: lines[i]
        });
      }
    }
  }

  return {
    filePath,
    exists: true,
    anchors
  };
}

function buildTargetLocator({ patchPlanner }) {
  const root = process.cwd();

  const repositoryTargetFile = patchPlanner?.repositoryTargetFile || null;

  const targets = [
    ...(repositoryTargetFile
      ? [
          {
            file: repositoryTargetFile,
            patterns: [
              "TODO",
              "FIXME",
              "throw new Error",
              "NotImplemented",
              "stub",
              "module.exports"
            ]
          }
        ]
      : []),
    {
      file: "ash/index.js",
      patterns: [
        "buildPatchPlanner",
        "runtimeResult.patchPlanner",
        "== Patch Planner =="
      ]
    },
    {
      file: "ash/runtime/patch-planner.js",
      patterns: [
        "function buildPatchPlanner",
        "module.exports"
      ]
    }
  ];

  const results = targets.map((target) =>
    findAnchorsInFile(path.join(root, target.file), target.patterns)
  );

  return {
    mode: "target-locator-runtime",
    version: "ash-local-runtime-v0.1",
    required: patchPlanner?.needsPatchPlanning === true,
    targetProject: patchPlanner?.targetProject || null,
    results,
    located:
      results.length > 0 &&
      results.every((result) => result.exists) &&
      results.some((result) => result.anchors.length > 0),
    locatedAt: new Date().toISOString()
  };
}

module.exports = {
  buildTargetLocator,
  findAnchorsInFile
};

