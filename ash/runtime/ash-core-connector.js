"use strict";

const fs = require("fs");
const path = require("path");

function readTextIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const content = fs.readFileSync(filePath, "utf8");

  return content.length > 0
    ? content
    : null;
}

function includesAny(text, keywords = []) {
  if (!text) {
    return false;
  }

  return keywords.some((keyword) => text.includes(keyword));
}

function createFileRecord(filePath) {
  const content = readTextIfExists(filePath);

  return {
    path: filePath,
    exists: fs.existsSync(filePath),
    loaded: Boolean(content),
    content
  };
}

function createSourceKey(fileName) {
  return fileName
    .replace(/\.md$/i, "")
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, character) =>
      character.toUpperCase()
    );
}

function parseActiveRuntimeFiles(indexContent = "") {
  if (!indexContent) {
    return [];
  }

  const lines = indexContent.split(/\r?\n/);
  const activeHeadingIndex = lines.findIndex((line) =>
    /^\s*Active files:\s*$/i.test(line)
  );

  if (activeHeadingIndex < 0) {
    return [];
  }

  const activeFiles = [];

  for (
    let index = activeHeadingIndex + 1;
    index < lines.length;
    index += 1
  ) {
    const line = lines[index];
    const match = line.match(
      /^\s*\d+\.\s+([a-zA-Z0-9_.-]+\.md)\s*$/
    );

    if (match) {
      activeFiles.push(match[1]);
      continue;
    }

    if (
      activeFiles.length > 0 &&
      (
        /^\s*---\s*$/.test(line) ||
        /^\s*#/.test(line)
      )
    ) {
      break;
    }
  }

  return [...new Set(activeFiles)];
}

function resolveActiveRuntimeFiles({
  ashCorePath,
  activeFiles = []
}) {
  return Object.fromEntries(
    activeFiles.map((fileName) => {
      const sourceKey = createSourceKey(fileName);
      const filePath = path.join(ashCorePath, fileName);

      return [
        sourceKey,
        {
          fileName,
          ...createFileRecord(filePath)
        }
      ];
    })
  );
}

function resolveRequiredCoreStatus(loadedFiles = {}) {
  const requiredFileNames = [
    "active_runtime_index.md",
    "boot_sequence.md",
    "ash_loader.md",
    "core_runtime.md",
    "ash_local_runtime_v01.md"
  ];

  const records = Object.values(loadedFiles);

  const requiredFiles = requiredFileNames.map((fileName) => {
    const record = records.find(
      (candidate) => candidate.fileName === fileName
    );

    return {
      fileName,
      path: record?.path || null,
      exists: record?.exists === true,
      loaded: record?.loaded === true
    };
  });

  const missingFiles = requiredFiles
    .filter((record) => !record.exists)
    .map((record) => record.fileName);

  const emptyFiles = requiredFiles
    .filter((record) => record.exists && !record.loaded)
    .map((record) => record.fileName);

  return {
    requiredFiles,
    missingFiles,
    emptyFiles,
    complete:
      missingFiles.length === 0 &&
      emptyFiles.length === 0
  };
}

function buildCoreContext({
  exists,
  loadedFiles,
  activeRuntimeFiles = []
}) {
  const runtimeRules =
    loadedFiles.runtimeExecutionRules?.content || "";

  const honneFortune =
    loadedFiles.honneFortuneDecisionLog?.content || "";

  const ashArchitecture =
    loadedFiles.ashOsArchitecture?.content || "";

  const activeRuntimeIndex =
    loadedFiles.activeRuntimeIndex?.content || "";

  const coreRuntime =
    loadedFiles.coreRuntime?.content || "";

  const localRuntime =
    loadedFiles.ashLocalRuntimeV01?.content || "";

  const verificationProtocol =
    loadedFiles.runtimeVerificationProtocol?.content || "";

  const operationSafety =
    loadedFiles.runtimeOperationSafetyArchitecture?.content || "";

  const allText = Object.values(loadedFiles)
    .map((record) => record?.content || "")
    .filter(Boolean)
    .join("\n\n");

  const requiredCore = resolveRequiredCoreStatus(loadedFiles);

  const activeLoadedCount = activeRuntimeFiles.filter(
    (fileName) => {
      const key = createSourceKey(fileName);
      return loadedFiles[key]?.loaded === true;
    }
  ).length;

  const activeMissingFiles = activeRuntimeFiles.filter(
    (fileName) => {
      const key = createSourceKey(fileName);
      return loadedFiles[key]?.exists !== true;
    }
  );

  const coreAvailable =
    Boolean(exists) &&
    requiredCore.complete &&
    activeRuntimeFiles.length > 0;

  return {
    mode: "ash-core-context",
    version: "v0.4-active-runtime-index",
    available: coreAvailable,
    identity: {
      source: "Ash_Core",
      role: "identity-governance-memory-core",
      ashCoreIsSourceOfTruth: true
    },
    runtimeStack: {
      indexLoaded: Boolean(activeRuntimeIndex),
      activeFiles: activeRuntimeFiles,
      declaredCount: activeRuntimeFiles.length,
      loadedCount: activeLoadedCount,
      missingFiles: activeMissingFiles,
      requiredCore
    },
    governance: {
      requiresCoreCheckBeforeRuntimeChange: includesAny(
        allText,
        [
          "CoreCheck",
          "CORE CHECK",
          "corecheck",
          "Before patch",
          "Before checkpoint",
          "Before git"
        ]
      ),
      requiresOwnerApprovalForHighImpact: includesAny(
        allText,
        [
          "Executive",
          "Finance",
          "Business",
          "owner",
          "approval",
          "確認"
        ]
      ),
      preferLowRiskAutonomy: includesAny(
        allText,
        [
          "low-risk",
          "低リスク",
          "自動",
          "autonomous"
        ]
      )
    },
    developmentPrinciples: {
      verifiedTargetEditing: includesAny(
        allText,
        [
          "位置特定",
          "verified",
          "anchor",
          "Select-String"
        ]
      ),
      connectExistingRuntimesFirst: includesAny(
        allText,
        [
          "existing runtime",
          "既存Runtime",
          "既存 Runtime",
          "reuse"
        ]
      ),
      avoidDuplicateRuntimes: includesAny(
        allText,
        [
          "duplicate",
          "重複",
          "duplication prevention"
        ]
      ),
      preferReuseBeforeCreation: includesAny(
        allText,
        [
          "reuse",
          "再利用",
          "before creation"
        ]
      ),
      measureAutonomyOverRuntimeCount: true
    },
    coreCheckRules: {
      beforePatch: includesAny(
        allText,
        [
          "Before patch",
          "before patch",
          "コード・運用出力前"
        ]
      ),
      beforeCheckpoint: includesAny(
        allText,
        [
          "Before checkpoint",
          "before checkpoint"
        ]
      ),
      beforeGit: includesAny(
        allText,
        [
          "Before git",
          "before git",
          "Git check"
        ]
      ),
      beforeHandover: includesAny(
        allText,
        [
          "Before handover",
          "before handover",
          "handover"
        ]
      )
    },
    runtimeEnforcement: {
      coreLoadingRequired: includesAny(
        localRuntime + "\n" + coreRuntime,
        [
          "Core Loading",
          "Runtime Enforcement",
          "RUNTIME ENFORCEMENT"
        ]
      ),
      enforcementBeforeOutput: includesAny(
        coreRuntime + "\n" + localRuntime,
        [
          "コード・運用出力前",
          "Runtime execution",
          "理解 = Runtime execution"
        ]
      ),
      skipIsRuntimeFailure: includesAny(
        localRuntime,
        [
          "Runtime Enforcement Skip",
          "runtime failure",
          "Runtime failure"
        ]
      )
    },
    persistenceRules: {
      saveRequiredMonitoring: includesAny(
        localRuntime + "\n" + coreRuntime,
        [
          "SAVE REQUIRED Monitoring",
          "SAVE REQUIRED",
          "save classification"
        ]
      ),
      gitStatusMonitoring: includesAny(
        localRuntime + "\n" + verificationProtocol,
        [
          "Git Status Monitoring",
          "git status",
          "repository"
        ]
      ),
      endingVerificationGate: includesAny(
        localRuntime + "\n" + verificationProtocol,
        [
          "Ending Verification Gate",
          "final verification",
          "Task Finalization Mode"
        ]
      )
    },
    outputSafety: {
      powershellSingleCodeBlock: includesAny(
        coreRuntime + "\n" + operationSafety,
        [
          "単独コードブロックのみ",
          "COPY BUTTON STABILITY"
        ]
      ),
      noExplanationInsidePowerShellBlock: includesAny(
        coreRuntime + "\n" + operationSafety,
        [
          "説明混在禁止",
          "command isolation"
        ]
      ),
      verifiedTargetBeforeEdit: includesAny(
        operationSafety + "\n" + runtimeRules,
        [
          "target location",
          "位置特定",
          "verified-anchor",
          "Locate"
        ]
      )
    },
    memory: {
      hasRuntimeRules: Boolean(runtimeRules),
      hasHonneFortuneDecisionLog: Boolean(honneFortune),
      hasAshOsArchitecture: Boolean(ashArchitecture),
      hasCoreRuntime: Boolean(coreRuntime),
      hasLocalRuntime: Boolean(localRuntime),
      hasVerificationProtocol: Boolean(verificationProtocol)
    },
    sourceFiles: Object.fromEntries(
      Object.entries(loadedFiles).map(([key, value]) => [
        key,
        {
          fileName: value.fileName || path.basename(value.path),
          path: value.path,
          exists: value.exists,
          loaded: value.loaded === true
        }
      ])
    ),
    unavailableReasons: [
      ...(!exists ? ["ash-core-directory-missing"] : []),
      ...(activeRuntimeFiles.length === 0
        ? ["active-runtime-index-empty"]
        : []),
      ...requiredCore.missingFiles.map(
        (fileName) => `required-core-missing:${fileName}`
      ),
      ...requiredCore.emptyFiles.map(
        (fileName) => `required-core-empty:${fileName}`
      )
    ],
    builtAt: new Date().toISOString()
  };
}

function loadAshCore(options = {}) {
  const ashCorePath =
    options.ashCorePath ||
    process.env.ASH_CORE_PATH ||
    path.resolve(process.cwd(), "..", "Ash_Core");

  const exists = fs.existsSync(ashCorePath);

  const baseFiles = {
    activeRuntimeIndex: {
      fileName: "active_runtime_index.md",
      path: path.join(
        ashCorePath,
        "active_runtime_index.md"
      )
    },
    runtimeExecutionRules: {
      fileName: "runtime_execution_rules.md",
      path: path.join(
        ashCorePath,
        "runtime_execution_rules.md"
      )
    },
    honneFortuneDecisionLog: {
      fileName: "honne_fortune.md",
      path: path.join(
        ashCorePath,
        "decision_logs",
        "honne_fortune.md"
      )
    },
    ashOsArchitecture: {
      fileName: "ash_os_architecture.md",
      path: path.join(
        ashCorePath,
        "decision_logs",
        "ash_os_architecture.md"
      )
    },
    runtimeVerificationProtocol: {
      fileName: "runtime_verification_protocol.md",
      path: path.join(
        ashCorePath,
        "runtime_verification_protocol.md"
      )
    },
    runtimeOperationSafetyArchitecture: {
      fileName: "runtime_operation_safety_architecture.md",
      path: path.join(
        ashCorePath,
        "runtime_operation_safety_architecture.md"
      )
    }
  };

  const loadedBaseFiles = Object.fromEntries(
    Object.entries(baseFiles).map(
      ([key, definition]) => [
        key,
        {
          fileName: definition.fileName,
          ...createFileRecord(definition.path)
        }
      ]
    )
  );

  const activeRuntimeFiles = parseActiveRuntimeFiles(
    loadedBaseFiles.activeRuntimeIndex?.content || ""
  );

  const loadedActiveFiles = resolveActiveRuntimeFiles({
    ashCorePath,
    activeFiles: activeRuntimeFiles
  });

  const loadedFiles = {
    ...loadedBaseFiles,
    ...loadedActiveFiles
  };

  const coreContext = buildCoreContext({
    exists,
    loadedFiles,
    activeRuntimeFiles
  });

  return {
    mode: "ash-core-connector",
    version: "v0.4-active-runtime-index",
    ashCorePath,
    exists,
    loadedFiles,
    activeRuntimeFiles,
    coreContext,
    principles: {
      readOnly: true,
      connectorOnly: true,
      doNotCreateRuntimeBeforeCheckingExisting: true,
      ashCoreBeforePcAshJudgment: true
    },
    loadedAt: new Date().toISOString()
  };
}

module.exports = {
  loadAshCore,
  buildCoreContext,
  parseActiveRuntimeFiles,
  resolveRequiredCoreStatus
};