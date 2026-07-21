"use strict";

const { spawnSync } = require("child_process");

const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_MAX_BUFFER_BYTES =
  4 * 1024 * 1024;

function normalizeText(value = null) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function normalizeArguments(value = null) {
  if (Array.isArray(value)) {
    return value
      .filter(
        (item) =>
          typeof item === "string"
      )
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(
        (item) =>
          typeof item === "string"
      )
      .map((item) => item.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function normalizePositiveInteger(
  value,
  fallback
) {
  const parsed = Number(value);

  return Number.isInteger(parsed) &&
    parsed > 0
    ? parsed
    : fallback;
}

function truncateText(
  value,
  maximumLength = 2000
) {
  const text = normalizeText(value);

  if (text.length <= maximumLength) {
    return text;
  }

  return `${
    text.slice(0, maximumLength)
  }...`;
}

function buildFailure({
  reason,
  command = null,
  exitCode = null,
  signal = null,
  stderr = null
} = {}) {
  return {
    success: false,
    providerName:
      "command-provider",
    executableCodeTemplate: null,
    reason:
      reason ||
      "Command implementation provider failed.",
    metadata: {
      command:
        normalizeText(command) || null,
      exitCode:
        Number.isInteger(exitCode)
          ? exitCode
          : null,
      signal:
        normalizeText(signal) || null,
      stderr:
        truncateText(stderr) || null
    }
  };
}

function parseProviderOutput({
  stdout,
  command
} = {}) {
  const text = normalizeText(stdout);

  if (!text) {
    return buildFailure({
      command,
      reason:
        "Command implementation provider returned no output."
    });
  }

  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch {
    return buildFailure({
      command,
      reason:
        "Command implementation provider returned invalid JSON."
    });
  }

  if (
    typeof parsed === "string" &&
    parsed.trim()
  ) {
    return {
      success: true,
      providerName:
        "command-provider",
      executableCodeTemplate:
        parsed.trim(),
      metadata: {
        command,
        outputFormat:
          "json-string"
      }
    };
  }

  if (
    !parsed ||
    typeof parsed !== "object"
  ) {
    return buildFailure({
      command,
      reason:
        "Command implementation provider returned an unsupported result."
    });
  }

  const executableCodeTemplate =
    normalizeText(
      parsed.executableCodeTemplate
    );

  if (
    parsed.success === false ||
    !executableCodeTemplate
  ) {
    return {
      ...buildFailure({
        command,
        reason:
          normalizeText(parsed.reason) ||
          "Command implementation provider did not produce executable code."
      }),
      providerResult: parsed
    };
  }

  return {
    ...parsed,
    success: true,
    providerName:
      normalizeText(
        parsed.providerName
      ) ||
      "command-provider",
    executableCodeTemplate,
    metadata: {
      ...(
        parsed.metadata &&
        typeof parsed.metadata ===
          "object"
          ? parsed.metadata
          : {}
      ),
      command,
      outputFormat:
        "json-object"
    }
  };
}

function createCommandProvider({
  command = null,
  args = [],
  cwd = process.cwd(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxBufferBytes =
    DEFAULT_MAX_BUFFER_BYTES,
  environment = process.env
} = {}) {
  const normalizedCommand =
    normalizeText(command);

  const normalizedArgs =
    normalizeArguments(args);

  const normalizedTimeoutMs =
    normalizePositiveInteger(
      timeoutMs,
      DEFAULT_TIMEOUT_MS
    );

  const normalizedMaxBufferBytes =
    normalizePositiveInteger(
      maxBufferBytes,
      DEFAULT_MAX_BUFFER_BYTES
    );

  return function commandImplementationProvider(
    providerInput = {}
  ) {
    if (!normalizedCommand) {
      return buildFailure({
        reason:
          "Command implementation provider requires an executable command."
      });
    }

    let serializedInput;

    try {
      serializedInput =
        JSON.stringify(providerInput);
    } catch (error) {
      return buildFailure({
        command:
          normalizedCommand,
        reason:
          error?.message ||
          "Provider input could not be serialized."
      });
    }

    const result = spawnSync(
      normalizedCommand,
      normalizedArgs,
      {
        cwd,
        env: environment,
        input: serializedInput,
        encoding: "utf8",
        windowsHide: true,
        timeout:
          normalizedTimeoutMs,
        maxBuffer:
          normalizedMaxBufferBytes
      }
    );

    if (result.error) {
      return buildFailure({
        command:
          normalizedCommand,
        exitCode:
          result.status,
        signal:
          result.signal,
        stderr:
          result.stderr,
        reason:
          result.error.message ||
          "Command implementation provider process failed."
      });
    }

    if (result.status !== 0) {
      return buildFailure({
        command:
          normalizedCommand,
        exitCode:
          result.status,
        signal:
          result.signal,
        stderr:
          result.stderr,
        reason:
          `Command implementation provider exited with code ${result.status}.`
      });
    }

    return parseProviderOutput({
      stdout:
        result.stdout,
      command:
        normalizedCommand
    });
  };
}

module.exports = {
  createCommandProvider,
  normalizeArguments,
  parseProviderOutput,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_BUFFER_BYTES
};
