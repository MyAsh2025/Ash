"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

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

  return {
    mode: "git-diff-check-runtime",
    success:
      diff.success &&
      status.success,
    clean:
      status.stdout.trim().length === 0,
    diffStat:
      diff.stdout.trim(),
    statusShort:
      status.stdout.trim()
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

function runCoreCheck({
  developmentPipeline = null,
  files = [],
  projectPath = process.cwd(),
  providerBoundaryRequired = true
} = {}) {
  const nodeCheck =
    runNodeCheck(files);

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

  const developmentPipelineOk =
    developmentPipeline == null ||
    developmentPipeline.success === true;

  const success =
    nodeCheck.success &&
    gitDiffCheck.success &&
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
  findForbiddenProviderExecution
};