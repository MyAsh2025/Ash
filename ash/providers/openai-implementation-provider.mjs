"use strict";

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import OpenAI from "openai";

function writeResult(result) {
  process.stdout.write(
    `${JSON.stringify(result)}\n`
  );
}

function fail(reason, details = {}) {
  writeResult({
    success: false,
    providerName: "openai-command",
    executableCodeTemplate: "",
    reason,
    ...details
  });
}

function safeString(value) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function safeStringArray(value) {
  return Array.isArray(value)
    ? value
        .map((item) => safeString(item))
        .filter(Boolean)
    : [];
}

function readStdin() {
  return fs.readFileSync(0, "utf8");
}

function extractJsonObject(rawValue) {
  const text = safeString(rawValue);

  if (!text) {
    throw new Error(
      "OpenAI implementation response was empty."
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    // Continue with fenced/object extraction.
  }

  const fencedMatch =
    text.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fencedMatch?.[1]) {
    return JSON.parse(fencedMatch[1].trim());
  }

  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");

  if (
    objectStart >= 0 &&
    objectEnd > objectStart
  ) {
    return JSON.parse(
      text.slice(objectStart, objectEnd + 1)
    );
  }

  throw new Error(
    "OpenAI response did not contain valid JSON."
  );
}

function normalizeProviderInput(rawInput) {
  const surroundingContext =
    rawInput?.surroundingContext &&
    typeof rawInput.surroundingContext === "object"
      ? rawInput.surroundingContext
      : {};

  return {
    task:
      safeString(rawInput?.task) ||
      safeString(rawInput?.selectedTask?.task) ||
      safeString(rawInput?.previousTask?.task),

    targetFile:
      safeString(rawInput?.targetFile),

    targetSymbol:
      safeString(rawInput?.targetSymbol),

    symbolType:
      safeString(rawInput?.symbolType) ||
      "unknown",

    expectedBehavior:
      safeStringArray(rawInput?.expectedBehavior),

    strategy:
      safeString(rawInput?.strategy),

    recommendedOperation:
      safeString(rawInput?.recommendedOperation),

    localRepairIntent:
      rawInput?.localRepairIntent &&
      typeof rawInput.localRepairIntent === "object"
        ? {
            mode:
              safeString(rawInput.localRepairIntent.mode),
            preserveExistingTarget:
              rawInput.localRepairIntent.preserveExistingTarget === true,
            allowTargetRedeclaration:
              rawInput.localRepairIntent.allowTargetRedeclaration === true,
            requireVerifiedLocalAnchor:
              rawInput.localRepairIntent.requireVerifiedLocalAnchor === true,
            localAnchorPattern:
              safeString(rawInput.localRepairIntent.localAnchorPattern),
            preferredOperation:
              safeString(rawInput.localRepairIntent.preferredOperation),
            integrationGoal:
              safeString(rawInput.localRepairIntent.integrationGoal),
            minimizeStructuralChange:
              rawInput.localRepairIntent.minimizeStructuralChange === true,
            safeStopRequired:
              rawInput.localRepairIntent.safeStopRequired === true
          }
        : null,

    repairAction:
      safeString(rawInput?.repairAction),

    failureStage:
      safeString(rawInput?.failureStage),

    errorMessage:
      safeString(rawInput?.errorMessage),

    issues:
      safeStringArray(rawInput?.issues),

    validatedOperations:
      Array.isArray(rawInput?.validatedOperations)
        ? rawInput.validatedOperations
            .filter(
              (operation) =>
                operation &&
                typeof operation === "object"
            )
            .map(
              (operation) => ({
                file:
                  safeString(operation.file),
                operation:
                  safeString(operation.operation),
                targetSymbol:
                  safeString(
                    operation.targetSymbol ||
                    operation.payload?.targetSymbol
                  ),
                readyForSafePatch:
                  operation.readyForSafePatch === true,
                destructiveReplaceChecked:
                  operation.destructiveReplaceChecked === true,
                destructiveReplace:
                  operation.destructiveReplace === true,
                destructiveReplaceMetrics:
                  operation.destructiveReplaceMetrics &&
                  typeof operation.destructiveReplaceMetrics === "object"
                    ? {
                        characterRatio:
                          Number.isFinite(
                            operation.destructiveReplaceMetrics
                              .characterRatio
                          )
                            ? operation.destructiveReplaceMetrics
                                .characterRatio
                            : null,
                        lineRatio:
                          Number.isFinite(
                            operation.destructiveReplaceMetrics
                              .lineRatio
                          )
                            ? operation.destructiveReplaceMetrics
                                .lineRatio
                            : null,
                        reason:
                          safeString(
                            operation.destructiveReplaceMetrics
                              .reason
                          )
                      }
                    : null
              })
            )
        : [],

    repairAware:
      rawInput?.repairAware === true,

    originalTask:
      rawInput?.originalTask &&
      typeof rawInput.originalTask === "object"
        ? {
            task:
              safeString(
                rawInput.originalTask.task
              ),
            targetFile:
              safeString(
                rawInput.originalTask.targetFile ||
                rawInput.originalTask.file
              ),
            targetSymbol:
              safeString(
                rawInput.originalTask.targetSymbol
              )
          }
        : null,

    surroundingContext: {
      text:
        safeString(surroundingContext.text),

      startLine:
        Number.isInteger(
          surroundingContext.startLine
        )
          ? surroundingContext.startLine
          : null,

      endLine:
        Number.isInteger(
          surroundingContext.endLine
        )
          ? surroundingContext.endLine
          : null
    }
  };
}

function validateProviderInput(input) {
  const missing = [];

  if (!input.targetFile) {
    missing.push("targetFile");
  }

  if (!input.targetSymbol) {
    missing.push("targetSymbol");
  }

  if (!input.surroundingContext.text) {
    missing.push("surroundingContext.text");
  }

  return missing;
}

function buildDeveloperPrompt() {
  return [
    "You are Ash's implementation code provider.",
    "Generate one concrete executable implementation for the requested target.",
    "Return JSON only.",
    "Do not include Markdown fences or explanatory text.",
    "Use exactly this JSON shape:",
    '{"executableCodeTemplate":"...","summary":"..."}',
    "",
    "Rules:",
    "- executableCodeTemplate must contain real implementation code.",
    "- Do not return diagnostic-only code.",
    "- Do not return TODO, FIXME, XXX, placeholder, stub, or pseudocode.",
    "- Preserve the surrounding file style and CommonJS/ESM convention.",
    "- Implement only the requested symbol or smallest safe replacement block.",
    "- Follow the requested operation exactly.",
    "- For replace, return only the complete replacement target symbol or requested replacement block.",
    "- For insert-before, return only code that can be inserted immediately before the target symbol. Do not redeclare or replace the target symbol.",
    "- For insert-after, return only code that can be inserted immediately after the target symbol. Do not redeclare or replace the target symbol.",
    "- When the operation is insert-before or insert-after, generating the target symbol declaration itself is invalid.",
    "- Do not append module.exports, export statements, unrelated declarations, or trailing file content unless they are part of the requested replacement block.",
    "- When repair context is provided, correct the reported failure instead of repeating the failed implementation.",
    "- Do not invent unrelated files, dependencies, or architectural layers.",
    "- Do not include a complete file unless the target requires it.",
    "- The code must be syntactically valid when substituted into the provided surrounding source context.",
    "- JSON string escaping must be valid."
  ].join("\n");
}

function resolveVerifiedLocalAnchorSymbol(input) {
  const localAnchorPattern =
    typeof input?.localRepairIntent?.localAnchorPattern === "string"
      ? input.localRepairIntent.localAnchorPattern.trim()
      : "";

  const localAnchorDeclaration =
    localAnchorPattern.match(
      /^\s*(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/
    );

  return localAnchorDeclaration?.[1] || null;
}

function buildUserPrompt(input) {
  const verifiedLocalAnchorSymbol =
    resolveVerifiedLocalAnchorSymbol(input);

  const localRepairConstraints =
    input.repairAware &&
    input.localRepairIntent?.requireVerifiedLocalAnchor === true
      ? [
          `Existing verified local anchor: ${
            input.localRepairIntent.localAnchorPattern ||
            "(not provided)"
          }`,
          `Existing local anchor symbol: ${
            verifiedLocalAnchorSymbol ||
            "(not resolved)"
          }`,
          "The verified local anchor already exists in the target source.",
          "Do not reproduce, replace, or redeclare the verified local anchor declaration.",
          verifiedLocalAnchorSymbol
            ? `Do not declare ${verifiedLocalAnchorSymbol} in executableCodeTemplate.`
            : "Do not declare the verified local anchor symbol in executableCodeTemplate.",
          input.recommendedOperation === "insert-before"
            ? "Return only the new code that belongs immediately BEFORE the existing verified local anchor."
            : input.recommendedOperation === "insert-after"
              ? "Return only the new code that belongs immediately AFTER the existing verified local anchor."
              : "Return only the minimal local augmentation required by the requested operation.",
          "The existing anchor declaration itself must not appear in executableCodeTemplate.",
          "If a safe local augmentation cannot be produced without redeclaring the anchor, do not repeat the rejected implementation."
        ].join("\n")
      : "(not required)";

  return [
    `Task: ${input.task || "(not provided)"}`,
    `Target file: ${input.targetFile}`,
    `Target symbol: ${input.targetSymbol}`,
    `Symbol type: ${input.symbolType}`,
    `Strategy: ${input.strategy || "(not provided)"}`,
    `Recommended operation: ${input.recommendedOperation || "(not provided)"}`,
    `Repair mode: ${input.repairAware ? "yes" : "no"}`,
    `Repair action: ${input.repairAction || "(not provided)"}`,
    `Failure stage: ${input.failureStage || "(not provided)"}`,
    "",
    "Previous repair failure:",
    input.errorMessage || "(not provided)",
    "",
    "Corrective local repair constraints:",
    localRepairConstraints,
    "",
    "Local repair intent:",
    input.localRepairIntent
      ? [
          `Mode: ${input.localRepairIntent.mode || "(not provided)"}`,
          `Preserve existing target: ${input.localRepairIntent.preserveExistingTarget ? "yes" : "no"}`,
          `Allow target redeclaration: ${input.localRepairIntent.allowTargetRedeclaration ? "yes" : "no"}`,
          `Require verified local anchor: ${input.localRepairIntent.requireVerifiedLocalAnchor ? "yes" : "no"}`,
          `Local anchor pattern: ${input.localRepairIntent.localAnchorPattern || "(not provided)"}`,
          `Preferred operation: ${input.localRepairIntent.preferredOperation || "(not provided)"}`,
          `Integration goal: ${input.localRepairIntent.integrationGoal || "(not provided)"}`,
          `Minimize structural change: ${input.localRepairIntent.minimizeStructuralChange ? "yes" : "no"}`,
          `Safe stop required: ${input.localRepairIntent.safeStopRequired ? "yes" : "no"}`
        ].join("\n")
      : "(not provided)",
    "",
    "Repair issues:",
    input.issues.length > 0
      ? input.issues
          .map(
            (item, index) =>
              `${index + 1}. ${item}`
          )
          .join("\n")
      : "(not provided)",
    "",
    "Validated operation failures:",
    input.validatedOperations.length > 0
      ? input.validatedOperations
          .map(
            (operation, index) =>
              [
                `${index + 1}. File: ${operation.file || "(unknown)"}`,
                `   Operation: ${operation.operation || "(unknown)"}`,
                `   Target symbol: ${operation.targetSymbol || "(unknown)"}`,
                `   Ready for safe patch: ${operation.readyForSafePatch ? "yes" : "no"}`,
                `   Destructive replace checked: ${operation.destructiveReplaceChecked ? "yes" : "no"}`,
                `   Destructive replace: ${operation.destructiveReplace ? "yes" : "no"}`,
                `   Character retention ratio: ${
                  operation.destructiveReplaceMetrics
                    ?.characterRatio ?? "(not provided)"
                }`,
                `   Line retention ratio: ${
                  operation.destructiveReplaceMetrics
                    ?.lineRatio ?? "(not provided)"
                }`,
                `   Validator reason: ${
                  operation.destructiveReplaceMetrics
                    ?.reason || "(not provided)"
                }`
              ].join("\n")
          )
          .join("\n")
      : "(not provided)",
    "",
    "Original task:",
    input.originalTask?.task ||
      "(not provided)",
    "",
    "Expected behavior:",
    input.expectedBehavior.length > 0
      ? input.expectedBehavior
          .map((item, index) =>
            `${index + 1}. ${item}`
          )
          .join("\n")
      : "(not provided)",
    "",
    "Surrounding source context:",
    input.surroundingContext.text
  ].join("\n");
}

async function main() {
  const providerDirectory =
    path.dirname(
      fileURLToPath(import.meta.url)
    );

  const defaultEnvFile =
    path.resolve(
      providerDirectory,
      "..",
      "..",
      ".env"
    );

  const envFile =
    safeString(
      process.env.ASH_OPENAI_ENV_FILE
    ) ||
    defaultEnvFile;

  const envResult =
    dotenv.config({
      path: envFile,
      override: false,
      quiet: true
    });

  if (envResult.error) {
    fail(
      "Ash OpenAI environment file could not be loaded.",
      {
        envFile,
        errorMessage:
          envResult.error.message
      }
    );
    return;
  }

  const apiKey =
    safeString(process.env.OPENAI_API_KEY);

  const model =
    safeString(
      process.env.OPENAI_API_MODEL
    ) || "gpt-4.1-mini";

  if (!apiKey) {
    fail(
      "OPENAI_API_KEY is not configured."
    );
    return;
  }

  let rawInput;

  try {
    rawInput = JSON.parse(readStdin());
  } catch (error) {
    fail(
      "Provider stdin did not contain valid JSON.",
      {
        errorMessage:
          error instanceof Error
            ? error.message
            : String(error)
      }
    );
    return;
  }

  const providerInput =
    normalizeProviderInput(rawInput);

  const missingFields =
    validateProviderInput(providerInput);

  if (missingFields.length > 0) {
    fail(
      "Provider input is incomplete.",
      {
        missingFields
      }
    );
    return;
  }

  const client =
    new OpenAI({
      apiKey,
      maxRetries: 1,
      timeout: 120000
    });

  try {
    const completion =
      await client.chat.completions.create({
        model,
        temperature: 0.1,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "ash_implementation_result",
            strict: true,
            schema: {
              type: "object",
              properties: {
                executableCodeTemplate: {
                  type: "string"
                },
                summary: {
                  type: "string"
                }
              },
              required: [
                "executableCodeTemplate",
                "summary"
              ],
              additionalProperties: false
            }
          }
        },
        messages: [
          {
            role: "developer",
            content:
              buildDeveloperPrompt()
          },
          {
            role: "user",
            content:
              buildUserPrompt(providerInput)
          }
        ]
      });

    const responseText =
      completion.choices?.[0]?.message
        ?.content ?? "";

    const parsed =
      extractJsonObject(responseText);

    const executableCodeTemplate =
      safeString(
        parsed.executableCodeTemplate
      );

    if (!executableCodeTemplate) {
      fail(
        "OpenAI did not produce executable implementation code.",
        {
          model,
          requestId:
            completion._request_id || null
        }
      );
      return;
    }

    writeResult({
      success: true,
      providerName:
        "openai-command",
      model,
      executableCodeTemplate,
      summary:
        safeString(parsed.summary),
      requestId:
        completion._request_id || null
    });
  } catch (error) {
    fail(
      "OpenAI implementation generation failed.",
      {
        model,
        errorName:
          error instanceof Error
            ? error.name
            : null,
        errorMessage:
          error instanceof Error
            ? error.message
            : String(error),
        requestId:
          error?._request_id || null,
        status:
          Number.isInteger(error?.status)
            ? error.status
            : null
      }
    );
  }
}

main().catch((error) => {
  fail(
    "Unexpected Ash OpenAI provider failure.",
    {
      errorMessage:
        error instanceof Error
          ? error.message
          : String(error)
    }
  );
});
