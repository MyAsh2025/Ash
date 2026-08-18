"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const DEFAULT_CORECHECK_FILES = Object.freeze([
  "./ash-auto-dev.js",
  "./ash-controller.js",
  "./ash-dev-verify.js",
  "./ash/runtime/autonomous-development-manager.js",
  "./ash/runtime/autonomous-development-target-symbol-stop-regression-test.js",
  "./ash/runtime/task-discovery-concrete-implementation-regression-test.js",
  "./ash/runtime/verified-runtime-evidence-discovery-integration-regression-test.js",
  "./ash/runtime/runtime-evidence-integrity-regression-test.js",
  "./ash/runtime/runtime-state-autonomous-evidence-retention-regression-test.js",
  "./ash/runtime/controller-lifecycle-regression-test.js",
  "./ash/runtime/controller-desktop-shutdown-regression-test.js",
  "./ash/runtime/development-pipeline-runtime.js",
  "./ash/runtime/queue-task-adapter.js",
  "./ash/runtime/implementation-planner.js",
  "./ash/runtime/implementation-provider.js",
  "./ash/runtime/implementation-provider-command.js",
  "./ash/runtime/implementation-provider-registry.js",
  "./ash/runtime/target-locator.js",
  "./ash/runtime/edit-planner.js",
  "./ash/runtime/patch-planner.js",
  "./ash/runtime/patch-generator.js",
  "./ash/runtime/code-generator.js",
  "./ash/runtime/patch-validator.js",
  "./ash/runtime/patch-apply-engine.js",
  "./ash/runtime/corecheck-runtime.js",
  "./ash/runtime/autonomous-development-repair-routing-regression-test.js",
  "./ash/runtime/autonomous-development-pending-repair-bootstrap-regression-test.js",
  "./ash/runtime/corecheck-apply-rollback-regression-test.js",
  "./ash/runtime/autonomous-manager-corecheck-rollback-integration-regression-test.js",
  "./ash/runtime/implementation-planner-initial-local-augmentation-regression-test.js",
  "./ash/runtime/implementation-planner-repair-evidence-regression-test.js",
  "./ash/runtime/implementation-provider-current-target-source-regression-test.js",
  "./ash/runtime/implementation-provider-progress-regression-test.js",
  "./ash/runtime/patch-validator-contract-retention-regression-test.js",
  "./ash/runtime/openai-provider-enforcement-contract-regression-test.js",
  "./ash/runtime/openai-provider-retry-evidence-integration-regression-test.js",
  "./ash/runtime/completion-evidence.js",
  "./ash/runtime/existing-repair-completion-evidence-regression-test.js",
  "./ash/runtime/completion-coverage-kind-regression-test.js",
  "./ash/runtime/existing-repair-cli-integration-regression-test.js",
  "./ash/runtime/completion-corecheck-integration-regression-test.js",
  "./ash/runtime/development-completion-contract-regression-test.js",
  "./ash/providers/openai-implementation-provider.mjs"
]);

const PROVIDER_BOUNDARY_FILES = Object.freeze({
  provider:
    "./ash/runtime/implementation-provider.js",
  commandProvider:
    "./ash/runtime/implementation-provider-command.js",
  registry:
    "./ash/runtime/implementation-provider-registry.js",
  developmentPipeline:
    "./ash/runtime/development-pipeline-runtime.js",
  codeGenerator:
    "./ash/runtime/code-generator.js"
});

function runCommand(command, args = []) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: false
  });

  return {
    command,
    args,
    status: result.status,
    success: result.status === 0,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error:
      result.error
        ? result.error.message
        : null
  };
}

function runNodeCheck(files = []) {
  const normalizedFiles =
    Array.isArray(files)
      ? files.filter(
          (file) =>
            typeof file === "string" &&
            file.trim().length > 0
        )
      : [];

  const results =
    normalizedFiles.map(
      (file) =>
        runCommand(
          "node",
          ["--check", file]
        )
    );

  return {
    mode: "node-check-runtime",
    success:
      results.length > 0 &&
      results.every(
        (result) =>
          result.success
      ),
    results
  };
}

function runGitDiffCheck() {
  const diff =
    runCommand(
      "git",
      ["diff", "--stat"]
    );

  const status =
    runCommand(
      "git",
      ["status", "--short"]
    );

  const diffCheck =
    runCommand(
      "git",
      ["diff", "--check"]
    );

  return {
    mode: "git-diff-check-runtime",
    success:
      diff.success &&
      status.success &&
      diffCheck.success,
    clean:
      status.stdout.trim().length === 0,
    diffStat:
      diff.stdout.trim(),
    statusShort:
      status.stdout.trim(),
    diffCheck: {
      success:
        diffCheck.success,
      stdout:
        diffCheck.stdout.trim(),
      stderr:
        diffCheck.stderr.trim(),
      error:
        diffCheck.error
    }
  };
}

function readRuntimeFile(
  file,
  {
    projectPath = process.cwd()
  } = {}
) {
  const absolutePath =
    path.resolve(
      projectPath,
      file
    );

  if (!fs.existsSync(absolutePath)) {
    return {
      file,
      absolutePath,
      exists: false,
      success: false,
      content: null,
      reason:
        `Required Provider Boundary file is missing: ${file}`
    };
  }

  try {
    return {
      file,
      absolutePath,
      exists: true,
      success: true,
      content:
        fs.readFileSync(
          absolutePath,
          "utf8"
        ),
      reason: null
    };
  } catch (error) {
    return {
      file,
      absolutePath,
      exists: true,
      success: false,
      content: null,
      reason:
        error?.message ||
        `Provider Boundary file could not be read: ${file}`
    };
  }
}

function createBoundaryCheck({
  id,
  description,
  fileResult,
  patterns = []
} = {}) {
  if (
    !fileResult ||
    fileResult.success !== true
  ) {
    return {
      id,
      description,
      file:
        fileResult?.file || null,
      success: false,
      matchedPatterns: [],
      missingPatterns:
        patterns.map(
          (pattern) =>
            pattern.description
        ),
      reason:
        fileResult?.reason ||
        "Required runtime file is unavailable."
    };
  }

  const matchedPatterns = [];
  const missingPatterns = [];

  for (const pattern of patterns) {
    if (
      pattern.expression.test(
        fileResult.content
      )
    ) {
      matchedPatterns.push(
        pattern.description
      );
    } else {
      missingPatterns.push(
        pattern.description
      );
    }
  }

  return {
    id,
    description,
    file:
      fileResult.file,
    success:
      missingPatterns.length === 0,
    matchedPatterns,
    missingPatterns,
    reason:
      missingPatterns.length === 0
        ? "Provider Boundary requirement is satisfied."
        : "Provider Boundary requirement is missing."
  };
}

function findForbiddenProviderExecution({
  projectPath = process.cwd()
} = {}) {
  const runtimeDirectory =
    path.resolve(
      projectPath,
      "./ash/runtime"
    );

  const allowedFiles =
    new Set([
      "implementation-provider-command.js"
    ]);

  const excludedScannerFiles =
    new Set([
      "corecheck-runtime.js"
    ]);

  const ignoredNamePatterns = [
    /\.backup\./i,
    /\.old$/i,
    /\.tmp$/i
  ];

  const executionPatterns = [
    {
      name: "OpenAI SDK import",
      expression:
        /require\(["']openai["']\)|from\s+["']openai["']/
    },
    {
      name: "OpenAI client construction",
      expression:
        /new\s+OpenAI\s*\(/
    },
    {
      name: "OpenAI API endpoint",
      expression:
        /https?:\/\/api\.openai\.com\//
    },
    {
      name: "OpenAI generation call",
      expression:
        /\.(responses|completions)\.create\s*\(/
    },
    {
      name: "Anthropic SDK import",
      expression:
        /require\(["']@anthropic-ai\/sdk["']\)|from\s+["']@anthropic-ai\/sdk["']/
    },
    {
      name: "Anthropic client construction",
      expression:
        /new\s+Anthropic\s*\(/
    },
    {
      name: "Anthropic message generation call",
      expression:
        /\.messages\.create\s*\(/
    },
    {
      name: "Google generative AI SDK import",
      expression:
        /require\(["']@google\/generative-ai["']\)|from\s+["']@google\/generative-ai["']/
    },
    {
      name: "Google generative AI client construction",
      expression:
        /new\s+GoogleGenerativeAI\s*\(/
    },
    {
      name: "Gemini generation call",
      expression:
        /\.generateContent\s*\(/
    },
    {
      name: "Ollama API endpoint",
      expression:
        /https?:\/\/(?:localhost|127\.0\.0\.1):11434\/api\//
    },
    {
      name: "Ollama SDK import",
      expression:
        /require\(["']ollama["']\)|from\s+["']ollama["']/
    }
  ];

  if (!fs.existsSync(runtimeDirectory)) {
    return {
      mode:
        "provider-execution-boundary-check",
      success: false,
      runtimeDirectory,
      violations: [],
      reason:
        "Ash runtime directory was not found."
    };
  }

  const violations = [];

  function visit(directory) {
    for (
      const entry of
      fs.readdirSync(
        directory,
        {
          withFileTypes: true
        }
      )
    ) {
      const entryPath =
        path.join(
          directory,
          entry.name
        );

      if (entry.isDirectory()) {
        if (
          entry.name === "node_modules" ||
          entry.name === "backup"
        ) {
          continue;
        }

        visit(entryPath);
        continue;
      }

      if (
        !entry.isFile() ||
        !entry.name.endsWith(".js") ||
        ignoredNamePatterns.some(
          (pattern) =>
            pattern.test(entry.name)
        ) ||
        allowedFiles.has(entry.name) ||
        excludedScannerFiles.has(entry.name)
      ) {
        continue;
      }

      let content;

      try {
        content =
          fs.readFileSync(
            entryPath,
            "utf8"
          );
      } catch (error) {
        violations.push({
          file:
            path.relative(
              projectPath,
              entryPath
            ),
          rule:
            "runtime-file-readable",
          reason:
            error?.message ||
            "Runtime file could not be read."
        });

        continue;
      }

      for (
        const executionPattern of
        executionPatterns
      ) {
        if (
          executionPattern.expression.test(
            content
          )
        ) {
          violations.push({
            file:
              path.relative(
                projectPath,
                entryPath
              ),
            rule:
              "external-implementation-execution-must-use-provider-boundary",
            match:
              executionPattern.name,
            reason:
              "External implementation engine references must remain behind the Implementation Provider boundary."
          });
        }
      }
    }
  }

  visit(runtimeDirectory);

  return {
    mode:
      "provider-execution-boundary-check",
    success:
      violations.length === 0,
    runtimeDirectory,
    allowedFiles:
      Array.from(allowedFiles),
    excludedScannerFiles:
      Array.from(excludedScannerFiles),
    violations,
    reason:
      violations.length === 0
        ? "No external implementation engine references were found outside the allowed provider boundary."
        : "External implementation engine references were found outside the allowed provider boundary."
  };
}

function runProviderBoundaryCheck({
  projectPath = process.cwd()
} = {}) {
  const files = {};

  for (
    const [name, file] of
    Object.entries(
      PROVIDER_BOUNDARY_FILES
    )
  ) {
    files[name] =
      readRuntimeFile(
        file,
        {
          projectPath
        }
      );
  }

  const checks = [
    createBoundaryCheck({
      id:
        "provider-runtime-contract",
      description:
        "Implementation Provider must expose the provider resolution boundary.",
      fileResult:
        files.provider,
      patterns: [
        {
          description:
            "resolveImplementationProvider export",
          expression:
            /\bresolveImplementationProvider\b/
        },
        {
          description:
            "provider function boundary",
          expression:
            /typeof\s+provider\s*!==?\s*["']function["']|typeof\s+provider\s*===?\s*["']function["']/
        },
        {
          description:
            "executable code result validation",
          expression:
            /executableCodeTemplate/
        },
        {
          description:
            "asynchronous provider rejection",
          expression:
            /Asynchronous implementation providers are not supported/
        }
      ]
    }),

    createBoundaryCheck({
      id:
        "provider-registry-contract",
      description:
        "Provider Registry must resolve providers from runtime context.",
      fileResult:
        files.registry,
      patterns: [
        {
          description:
            "registry resolver",
          expression:
            /\bresolveImplementationProviderFromContext\b/
        },
        {
          description:
            "context provider support",
          expression:
            /context\.implementationProvider/
        },
        {
          description:
            "command provider registration",
          expression:
            /\bcreateCommandProvider\b/
        }
      ]
    }),

    createBoundaryCheck({
      id:
        "command-provider-contract",
      description:
        "Command execution must remain inside the command implementation provider.",
      fileResult:
        files.commandProvider,
      patterns: [
        {
          description:
            "child process boundary",
          expression:
            /require\(["']child_process["']\)/
        },
        {
          description:
            "synchronous command execution",
          expression:
            /\bspawnSync\b/
        },
        {
          description:
            "provider input serialization",
          expression:
            /JSON\.stringify\(providerInput\)/
        },
        {
          description:
            "provider output executable template",
          expression:
            /executableCodeTemplate/
        }
      ]
    }),

    createBoundaryCheck({
      id:
        "development-pipeline-provider-connection",
      description:
        "Development Pipeline must resolve and invoke the Implementation Provider boundary.",
      fileResult:
        files.developmentPipeline,
      patterns: [
        {
          description:
            "provider registry import or resolver reference",
          expression:
            /resolveImplementationProviderFromContext/
        },
        {
          description:
            "provider boundary import or resolver reference",
          expression:
            /resolveImplementationProvider/
        },
        {
          description:
            "provider result connection",
          expression:
            /implementationProvider/
        }
      ]
    }),

    createBoundaryCheck({
      id:
        "code-generator-provider-consumption",
      description:
        "Code Generator must consume an executable implementation template.",
      fileResult:
        files.codeGenerator,
      patterns: [
        {
          description:
            "executable code template consumption",
          expression:
            /executableCodeTemplate/
        },
        {
          description:
            "generated code output",
          expression:
            /generatedCode/
        }
      ]
    })
  ];

  const externalExecutionBoundary =
    findForbiddenProviderExecution({
      projectPath
    });

  const fileResults =
    Object.values(files).map(
      ({
        content,
        ...result
      }) =>
        result
    );

  const success =
    fileResults.every(
      (result) =>
        result.success
    ) &&
    checks.every(
      (check) =>
        check.success
    ) &&
    externalExecutionBoundary.success;

  return {
    mode:
      "implementation-provider-boundary-check",
    version:
      "ash-local-runtime-v0.1-provider-boundary-check",
    success,
    files:
      fileResults,
    checks,
    externalExecutionBoundary,
    reason:
      success
        ? "Implementation Provider Boundary is valid."
        : "Implementation Provider Boundary validation failed.",
    checkedAt:
      new Date().toISOString()
  };
}


function getPermanentRegressionChecks() {
  return [
    {
      id: "autonomous-development-repair-routing",
      file: "./ash/runtime/autonomous-development-repair-routing-regression-test.js",
      args: [],
      coverage: { kind: "symbol", targetFiles: ["ash/runtime/autonomous-development-manager.js"], targetSymbols: ["extractCapabilityFailure", "buildRepairTask"] }
    },
    {
      id: "autonomous-development-pending-repair-bootstrap",
      file: "./ash/runtime/autonomous-development-pending-repair-bootstrap-regression-test.js",
      args: [],
      coverage: { kind: "symbol", targetFiles: ["ash/runtime/autonomous-development-manager.js"], targetSymbols: ["runAutonomousDevelopmentManager"] }
    },
    {
      id: "autonomous-development-target-symbol-stop",
      file: "./ash/runtime/autonomous-development-target-symbol-stop-regression-test.js",
      args: [],
      coverage: { kind: "symbol", targetFiles: ["ash/runtime/autonomous-development-manager.js"], targetSymbols: ["extractCapabilityFailure", "runAutonomousDevelopmentManager"] }
    },
    {
      id: "task-discovery-concrete-implementation",
      file: "./ash/runtime/task-discovery-concrete-implementation-regression-test.js",
      args: [],
      coverage: { kind: "symbol", targetFiles: ["ash/runtime/task-discovery-runtime.js"], targetSymbols: ["buildConcreteImplementationPlanningTask", "isConcreteImplementationPlanningSatisfied", "discoverTaskFromRepository"] }
    },
    {
      id: "verified-runtime-evidence-discovery-integration",
      file: "./ash/runtime/verified-runtime-evidence-discovery-integration-regression-test.js",
      args: [],
      coverage: {
        kind: "symbol",
        targets: [
          { targetFile: "ash/runtime/runtime-state.js", targetSymbols: ["readAutonomousCompletedTasks", "readAutonomousRuntimeEvidence", "recordAutonomousDevelopmentResult", "recordFormalCompletionEvidence", "selectVerifiedRuntimeEvidence"] },
          { targetFile: "ash/runtime/repository-observation-runtime.js", targetSymbols: ["observeRepository"] },
          { targetFile: "ash/runtime/task-discovery-runtime.js", targetSymbols: ["discoverTaskFromRepository"] }
        ]
      }
    },
    {
      id: "runtime-evidence-integrity",
      file: "./ash/runtime/runtime-evidence-integrity-regression-test.js",
      args: [],
      coverage: {
        kind: "symbol",
        targetFiles: ["ash/runtime/runtime-state.js"],
        targetSymbols: ["writeRuntimeState", "recordAutonomousDevelopmentResult"]
      }
    },
    {
      id: "runtime-state-autonomous-evidence-retention",
      file: "./ash/runtime/runtime-state-autonomous-evidence-retention-regression-test.js",
      args: [],
      coverage: {
        kind: "symbol",
        targetFiles: ["ash/runtime/runtime-state.js"],
        targetSymbols: ["writeRuntimeState"]
      }
    },
    {
      id: "controller-lifecycle",
      file: "./ash/runtime/controller-lifecycle-regression-test.js",
      args: [],
      coverage: {
        kind: "file",
        targetFiles: ["ash-controller.js", "ash-auto-dev.js"]
      }
    },
    {
      id: "controller-desktop-shutdown",
      file: "./ash/runtime/controller-desktop-shutdown-regression-test.js",
      args: [],
      coverage: {
        kind: "file",
        targetFiles: ["PC-Ash-Desktop-Controller.ps1"]
      }
    },
    {
      id: "corecheck-apply-rollback",
      file: "./ash/runtime/corecheck-apply-rollback-regression-test.js",
      args: [],
      coverage: { kind: "symbol", targetFiles: ["ash/runtime/patch-apply-engine.js"], targetSymbols: ["rollbackAppliedPatch"] }
    },
    {
      id: "autonomous-manager-corecheck-rollback-integration",
      file: "./ash/runtime/autonomous-manager-corecheck-rollback-integration-regression-test.js",
      args: [],
      coverage: { kind: "symbol", targetFiles: ["ash/runtime/autonomous-development-manager.js"], targetSymbols: ["runAutonomousDevelopmentManager"] }
    },
    {
      id: "implementation-planner-initial-local-augmentation",
      file: "./ash/runtime/implementation-planner-initial-local-augmentation-regression-test.js",
      args: [],
      coverage: { kind: "symbol", targetFiles: ["ash/runtime/implementation-planner.js"], targetSymbols: ["buildImplementationPlanner"] }
    },
    {
      id: "implementation-planner-repair-evidence",
      file: "./ash/runtime/implementation-planner-repair-evidence-regression-test.js",
      args: [],
      coverage: { kind: "symbol", targetFiles: ["ash/runtime/implementation-planner.js"], targetSymbols: ["buildRepairSymbolInferenceText", "buildImplementationPlanner"] }
    },
    {
      id: "queue-task-adapter-target-symbol-readiness",
      file: "./ash/runtime/queue-task-adapter-target-symbol-readiness-regression-test.js",
      args: [],
      coverage: { kind: "symbol", targetFiles: ["ash/runtime/queue-task-adapter.js"], targetSymbols: ["adaptQueueItemForExecution"] }
    },
    {
      id: "implementation-provider-current-target-source",
      file: "./ash/runtime/implementation-provider-current-target-source-regression-test.js",
      args: [],
      coverage: { kind: "symbol", targetFiles: ["ash/runtime/implementation-provider.js"], targetSymbols: ["extractCurrentTargetSource", "buildProviderInput"] }
    },
    {
      id: "implementation-provider-local-repair-anchor",
      file: "./ash/runtime/implementation-provider-local-repair-anchor-regression-test.js",
      args: [],
      coverage: { kind: "symbol", targetFiles: ["ash/runtime/implementation-provider.js"], targetSymbols: ["buildProviderInput"] }
    },
    {
      id: "implementation-provider-progress",
      file: "./ash/runtime/implementation-provider-progress-regression-test.js",
      args: [],
      coverage: { kind: "symbol", targetFiles: ["ash/runtime/implementation-provider-command.js"], targetSymbols: ["createCommandProvider"] }
    },
    {
      id: "patch-validator-contract-retention",
      file: "./ash/runtime/patch-validator-contract-retention-regression-test.js",
      args: [],
      coverage: { kind: "symbol", targetFiles: ["ash/runtime/patch-validator.js"], targetSymbols: ["evaluateDestructiveReplace", "extractLocalDeclarationNames"] }
    },
    {
      id: "openai-provider-invented-runtime-semantic",
      file: "./ash/providers/openai-implementation-provider.mjs",
      args: ["--semantic-self-check"],
      coverage: { kind: "symbol", targetFiles: ["ash/providers/openai-implementation-provider.mjs"], targetSymbols: ["classifyReturnPropertyExpression", "findInventedRuntimeDependencyViolation", "runReturnContractShapeSemanticSmoke", "runInventedRuntimeDependencySemanticSmoke"] }
    },
    {
      id: "openai-provider-enforcement-contract",
      file: "./ash/runtime/openai-provider-enforcement-contract-regression-test.js",
      args: [],
      coverage: { kind: "symbol", targetFiles: ["ash/providers/openai-implementation-provider.mjs"], targetSymbols: ["normalizeProviderInput", "classifyReturnPropertyExpression", "findReturnContractShapeViolation", "findIllustrativeImplementationViolation", "findInventedRuntimeDependencyViolation", "findImmediateGenerationViolation", "buildViolationCorrectionGuidance", "runEnforcementContractSelfCheck"] }
    },
    {
      id: "openai-provider-retry-evidence-integration",
      file: "./ash/runtime/openai-provider-retry-evidence-integration-regression-test.js",
      args: [],
      coverage: { kind: "symbol", targetFiles: ["ash/providers/openai-implementation-provider.mjs"], targetSymbols: ["buildRetryEvidenceRegressionClient", "main"] }
    },
    {
      id: "existing-repair-completion-evidence",
      file: "./ash/runtime/existing-repair-completion-evidence-regression-test.js",
      args: [],
      coverage: { kind: "symbol", targetFiles: ["ash/runtime/completion-evidence.js"], targetSymbols: ["evaluateExistingRepairEligibility", "buildExistingRepairCompletionEvidence"] }
    },
    {
      id: "completion-coverage-kind",
      file: "./ash/runtime/completion-coverage-kind-regression-test.js",
      args: [],
      coverage: { kind: "symbol", targetFiles: ["ash/runtime/completion-evidence.js"], targetSymbols: ["normalizeRepositoryPath", "parseChangedLineRanges", "findRegressionRegistration", "evaluateExistingRepairEligibility"] }
    },
    {
      id: "existing-repair-cli-integration",
      file: "./ash/runtime/existing-repair-cli-integration-regression-test.js",
      args: [],
      coverage: { kind: "file", targetFiles: ["ash-auto-dev.js"] }
    },
    {
      id: "completion-corecheck-integration",
      file: "./ash/runtime/completion-corecheck-integration-regression-test.js",
      args: [],
      coverage: {
        kind: "symbol",
        targets: [
          { targetFile: "ash/runtime/autonomous-development-manager.js", targetSymbols: ["runExistingRepairVerification"] },
          { targetFile: "ash/runtime/corecheck-runtime.js", targetSymbols: ["getPermanentRegressionChecks", "runPermanentRegressionChecks", "runCoreCheck"] }
        ]
      }
    },
    {
      id: "development-completion-contract",
      file: "./ash/runtime/development-completion-contract-regression-test.js",
      args: [],
      coverage: { kind: "file", targetFiles: ["AGENTS.md", "ASH-MIGRATION-MASTER.md", "ash/DEVELOPMENT-RULES.md", "ash-dev-verify.js"] }
    }
  ];
}

function runPermanentRegressionChecks({
  projectPath = process.cwd(),
  checks = getPermanentRegressionChecks()
} = {}) {
  const results = checks.map((check) => {
    const execution = spawnSync(
      "node",
      [
        check.file,
        ...(Array.isArray(check.args)
          ? check.args
          : [])
      ],
      {
        cwd: projectPath,
        encoding: "utf8",
        shell: false
      }
    );

    return {
      id: check.id,
      file: check.file,
      coverage: check.coverage,
      args:
        Array.isArray(check.args)
          ? check.args
          : [],
      success: execution.status === 0,
      status: execution.status,
      stdout: execution.stdout || "",
      stderr: execution.stderr || "",
      error:
        execution.error
          ? execution.error.message
          : null
    };
  });

  return {
    mode: "permanent-regression-checks",
    success:
      results.length > 0 &&
      results.every((result) => result.success),
    results
  };
}

function runCoreCheck({
  developmentPipeline = null,
  files = [],
  projectPath = process.cwd(),
  providerBoundaryRequired = true,
  permanentRegressionChecksRunner = runPermanentRegressionChecks
} = {}) {
  const nodeCheckFiles =
    Array.isArray(files) &&
    files.some(
      (file) =>
        typeof file === "string" &&
        file.trim().length > 0
    )
      ? files
      : DEFAULT_CORECHECK_FILES;

  const nodeCheck =
    runNodeCheck(nodeCheckFiles);

  const gitDiffCheck =
    runGitDiffCheck();

  const providerBoundary =
    providerBoundaryRequired
      ? runProviderBoundaryCheck({
          projectPath
        })
      : {
          mode:
            "implementation-provider-boundary-check",
          success: true,
          skipped: true,
          reason:
            "Implementation Provider Boundary validation was disabled."
        };

  const permanentRegressionChecks =
    permanentRegressionChecksRunner({
      projectPath
    });

  const developmentPipelineOk =
    developmentPipeline == null ||
    developmentPipeline.success === true;

  const success =
    nodeCheck.success &&
    gitDiffCheck.success &&
    permanentRegressionChecks.success &&
    developmentPipelineOk &&
    providerBoundary.success;

  return {
    mode: "corecheck-runtime",
    version:
      "ash-local-runtime-v0.2-provider-boundary",
    success,
    developmentPipelineOk,
    nodeCheck,
    gitDiffCheck,
    permanentRegressionChecks,
    permanentRegressionChecksOk:
      permanentRegressionChecks.success,
    repositoryClean:
      gitDiffCheck.clean,
    providerBoundary,
    providerBoundaryOk:
      providerBoundary.success,
    checkpointRecommended:
      success &&
      !gitDiffCheck.clean,
    reason:
      success
        ? "CoreCheck passed."
        : "CoreCheck failed.",
    checkedAt:
      new Date().toISOString()
  };
}

module.exports = {
  runCoreCheck,
  runNodeCheck,
  runGitDiffCheck,
  runProviderBoundaryCheck,
  findForbiddenProviderExecution,
  runPermanentRegressionChecks,
  getPermanentRegressionChecks
};
