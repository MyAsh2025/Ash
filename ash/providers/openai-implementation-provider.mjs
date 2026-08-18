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
    completeTargetSource:
      safeString(
        rawInput?.completeTargetSource
      ),
    currentTargetSource:
      safeString(
        rawInput?.currentTargetSource
      ),
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

    verifiedLocalAnchor:
      rawInput?.verifiedLocalAnchor &&
      typeof rawInput.verifiedLocalAnchor === "object"
        ? {
            verified:
              rawInput.verifiedLocalAnchor.verified === true,
            anchorType:
              safeString(
                rawInput.verifiedLocalAnchor.anchorType
              ),
            targetSymbol:
              safeString(
                rawInput.verifiedLocalAnchor.targetSymbol
              ),
            pattern:
              safeString(
                rawInput.verifiedLocalAnchor.pattern
              ),
            line:
              Number.isInteger(
                rawInput.verifiedLocalAnchor.line
              )
                ? rawInput.verifiedLocalAnchor.line
                : null,
            offset:
              Number.isInteger(
                rawInput.verifiedLocalAnchor.offset
              )
                ? rawInput.verifiedLocalAnchor.offset
                : null,
            insertionOffset:
              Number.isInteger(
                rawInput.verifiedLocalAnchor.insertionOffset
              )
                ? rawInput.verifiedLocalAnchor.insertionOffset
                : null,
            operation:
              safeString(
                rawInput.verifiedLocalAnchor.operation
              )
          }
        : null,

    requiredOutputShape:
      safeString(
        rawInput?.requiredOutputShape
      ) || "module-fragment",

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

    developmentPrinciples:
      rawInput?.developmentPrinciples &&
      typeof rawInput.developmentPrinciples === "object"
        ? {
            verifiedTargetEditing:
              rawInput.developmentPrinciples.verifiedTargetEditing === true,
            connectExistingRuntimesFirst:
              rawInput.developmentPrinciples.connectExistingRuntimesFirst === true,
            avoidDuplicateRuntimes:
              rawInput.developmentPrinciples.avoidDuplicateRuntimes === true,
            preferReuseBeforeCreation:
              rawInput.developmentPrinciples.preferReuseBeforeCreation === true,
            measureAutonomyOverRuntimeCount:
              rawInput.developmentPrinciples.measureAutonomyOverRuntimeCount === true,
            directExecutionPathVerification:
              rawInput.developmentPrinciples.directExecutionPathVerification === true,
            summarizeLargeVerificationOutput:
              rawInput.developmentPrinciples.summarizeLargeVerificationOutput === true
          }
        : null,

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

    existingLocalDeclarations:
      safeStringArray(
        rawInput?.existingLocalDeclarations
      ),

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
    "- Do not add metadata fields unless an existing downstream runtime reads or enforces them.",
    "- Prefer changing executable behavior, validation, routing, or state propagation over adding descriptive metadata.",
    "- Every newly added field must have a concrete consumer in the existing execution path.",
    "- Do not increase priority, add dependency names, or add nested policy objects merely to make the result appear more complete.",
    "- Preserve existing fields that downstream planners and validators already consume.",
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

function buildFunctionBodyConstraints(input) {
  if (
    input?.verifiedLocalAnchor?.anchorType !==
      "function-body-opening"
  ) {
    return "(not required)";
  }

  return [
    "The insertion point is immediately after the opening brace of the existing target function.",
    "Return only executable statements that belong inside the existing function body.",
    "Do not return function or class declarations.",
    "Do not redeclare or wrap the target function.",
    "Local const, let, var, if, for, while, try, return, and expression statements are allowed.",
    "Every returned statement must directly contribute to the requested behavior.",
    "Do not return unused helpers or unrelated setup code.",
    "",
    "BAD output example:",
    "function replacementFunction() { return null; }",
    "",
    "BAD output example:",
    "// No local augmentation needed.",
    "",
    "GOOD output shape:",
    "const normalizedValue = String(value || \"\").trim();",
    "if (!normalizedValue) { return null; }",
    "",
    "Return executable JavaScript statements only. Do not include markdown fences or explanations.",
    "Do not serialize the target function source into implementationTemplate or executableCodeTemplate string properties.",
    "Do not embed the current target function inside its own returned metadata.",
    "Implementation metadata must describe the concrete target, not quote or duplicate the generated function source.",
    "When concrete implementation metadata cannot be derived safely, preserve the existing unresolved null values instead of inventing examples, type names, or code strings."
  ].join("\n");
}

function buildRequiredOutputShapeConstraints(
  input = null
) {
  const requiredOutputShape =
    safeString(
      input?.requiredOutputShape
    ) || "module-fragment";

  const targetSymbol =
    safeString(
      input?.targetSymbol
    );

  if (
    requiredOutputShape ===
    "complete-function"
  ) {
    return [
      "Required output shape: complete-function.",
      `Return exactly one complete JavaScript function declaration named ${targetSymbol || "(target symbol)"}.`,
      "The executableCodeTemplate must begin with the function declaration.",
      "Preserve the exact target function name.",
      "Return the entire function, including its opening and closing braces.",
      "Do not return only the function body statements.",
      "Do not return an object literal, metadata object, explanation, example, or markdown fence.",
      "Do not rename, omit, or remove the target function."
    ].join("\n");
  }

  if (
    requiredOutputShape ===
    "complete-class"
  ) {
    return [
      "Required output shape: complete-class.",
      `Return exactly one complete JavaScript class declaration named ${targetSymbol || "(target symbol)"}.`,
      "Return the entire class declaration.",
      "Do not return only methods, statements, explanations, examples, or markdown fences."
    ].join("\n");
  }

  if (
    requiredOutputShape ===
    "complete-symbol"
  ) {
    return [
      "Required output shape: complete-symbol.",
      `Return one complete declaration for ${targetSymbol || "(target symbol)"}.`,
      "Do not return only a fragment, explanation, example, or markdown fence."
    ].join("\n");
  }

  if (
    requiredOutputShape ===
    "statements-only"
  ) {
    return [
      "Required output shape: statements-only.",
      "Return only executable JavaScript statements for insertion inside the existing function body.",
      "Do not return function or class declarations.",
      "Do not wrap the statements in another function or block."
    ].join("\n");
  }

  return [
    `Required output shape: ${requiredOutputShape}.`,
    "Return concrete executable JavaScript only.",
    "Do not return explanations, examples, placeholders, or markdown fences."
  ].join("\n");
}

function extractRequiredReturnProperties(
  sourceText = ""
) {
  if (
    typeof sourceText !== "string" ||
    sourceText.trim().length === 0
  ) {
    return [];
  }

  const returnObjectMatch =
    /\breturn\s*\{([\s\S]*?)\n\s{2}\};/.exec(
      sourceText
    );

  if (!returnObjectMatch) {
    return [];
  }

  const objectBody =
    returnObjectMatch[1];

  const properties =
    new Set();

  const propertyPatterns = [
    /^\s{4}([A-Za-z_$][\w$]*)\s*:/gm,
    /^\s{4}([A-Za-z_$][\w$]*)\s*,?\s*$/gm
  ];

  for (
    const propertyPattern of propertyPatterns
  ) {
    let match = null;

    while (
      (
        match =
          propertyPattern.exec(
            objectBody
          )
      ) !== null
    ) {
      properties.add(
        match[1]
      );
    }
  }

  return [...properties];
}

function classifyReturnPropertyExpression(
  expression = ""
) {
  const normalized =
    safeString(expression);

  if (!normalized) {
    return "unknown";
  }

  if (
    normalized === "null"
  ) {
    return "null";
  }

  if (
    normalized === "true" ||
    normalized === "false"
  ) {
    return "boolean";
  }

  if (
    /^(?:!\s*)+/.test(normalized) ||
    /\b(?:===|!==|==|!=|<=|>=|<|>)\b/.test(
      normalized
    ) ||
    /(?:===|!==|==|!=|<=|>=|<|>)/.test(
      normalized
    ) ||
    /(?:^|[^\w$])(?:in|instanceof)(?:[^\w$]|$)/.test(
      normalized
    )
  ) {
    return "boolean";
  }

  if (
    /^["'`]/.test(normalized)
  ) {
    return "string";
  }

  if (
    /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(
      normalized
    )
  ) {
    return "number";
  }

  if (
    normalized.startsWith("[")
  ) {
    return "array";
  }

  if (
    normalized.startsWith("{")
  ) {
    return "object";
  }

  if (
    /^(?:async\s+)?function\b/.test(normalized) ||
    /^(?:async\s*)?\([^)]*\)\s*=>/.test(normalized) ||
    /^(?:async\s+)?[A-Za-z_$][\w$]*\s*=>/.test(normalized)
  ) {
    return "function";
  }

  return "identifier";
}

function extractTopLevelReturnPropertyShapes(
  sourceText = ""
) {
  if (
    typeof sourceText !== "string" ||
    sourceText.trim().length === 0
  ) {
    return {};
  }

  const returnObjectMatch =
    /\breturn\s*\{([\s\S]*?)\n\s{2}\};/.exec(
      sourceText
    );

  if (!returnObjectMatch) {
    return {};
  }

  const objectBody =
    returnObjectMatch[1];

  const lines =
    objectBody.split(/\r?\n/);

  const shapes = {};
  let depth = 0;

  for (const line of lines) {
    const trimmed =
      line.trim();

    if (!trimmed) {
      continue;
    }

    if (depth === 0) {
      const explicitMatch =
        /^([A-Za-z_$][\w$]*)\s*:\s*(.+?)(?:,\s*)?$/.exec(
          trimmed
        );

      if (explicitMatch) {
        const property =
          explicitMatch[1];

        const expression =
          explicitMatch[2];

        shapes[property] =
          classifyReturnPropertyExpression(
            expression
          );
      } else {
        const shorthandMatch =
          /^([A-Za-z_$][\w$]*)\s*,?$/.exec(
            trimmed
          );

        if (shorthandMatch) {
          shapes[shorthandMatch[1]] =
            "identifier";
        }
      }
    }

    for (const character of line) {
      if (
        character === "{" ||
        character === "["
      ) {
        depth += 1;
      } else if (
        character === "}" ||
        character === "]"
      ) {
        depth -= 1;
      }
    }
  }

  return shapes;
}

function extractNestedObjectPropertyKeys(
  sourceText = "",
  propertyName = ""
) {
  const normalizedSource =
    safeString(sourceText);

  const normalizedProperty =
    safeString(propertyName);

  if (
    !normalizedSource ||
    !normalizedProperty
  ) {
    return [];
  }

  const escapedProperty =
    normalizedProperty.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

  const startPattern =
    new RegExp(
      `\\b${escapedProperty}\\s*:\\s*\\{`,
      "m"
    );

  const match =
    startPattern.exec(
      normalizedSource
    );

  if (!match) {
    return [];
  }

  const objectStart =
    normalizedSource.indexOf(
      "{",
      match.index
    );

  if (objectStart < 0) {
    return [];
  }

  let depth = 0;
  let objectEnd = -1;

  for (
    let index = objectStart;
    index < normalizedSource.length;
    index += 1
  ) {
    const character =
      normalizedSource[index];

    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;

      if (depth === 0) {
        objectEnd = index;
        break;
      }
    }
  }

  if (objectEnd < 0) {
    return [];
  }

  const objectBody =
    normalizedSource.slice(
      objectStart + 1,
      objectEnd
    );

  const keys =
    [];
  let nestedDepth = 0;

  for (
    const line
    of objectBody.split(/\r?\n/)
  ) {
    const trimmed =
      line.trim();

    if (nestedDepth === 0) {
      const propertyMatch =
        /^([A-Za-z_$][\w$]*)\s*(?::|,|$)/.exec(
          trimmed
        );

      if (
        propertyMatch &&
        ![
          "null",
          "true",
          "false",
          "undefined"
        ].includes(
          propertyMatch[1]
        )
      ) {
        keys.push(
          propertyMatch[1]
        );
      }
    }

    for (const character of line) {
      if (
        character === "{" ||
        character === "["
      ) {
        nestedDepth += 1;
      } else if (
        character === "}" ||
        character === "]"
      ) {
        nestedDepth -= 1;
      }
    }
  }

  return Array.from(
    new Set(keys)
  );
}

function findNestedReturnContractViolation({
  input = null,
  executableCodeTemplate = ""
} = {}) {
  const currentTargetSource =
    safeString(
      input?.currentTargetSource
    );

  const guardedProperties = [
    "implementationTemplate"
  ];

  const violations = [];

  for (
    const propertyName
    of guardedProperties
  ) {
    const requiredKeys =
      extractNestedObjectPropertyKeys(
        currentTargetSource,
        propertyName
      );

    if (requiredKeys.length === 0) {
      continue;
    }

    const generatedKeys =
      extractNestedObjectPropertyKeys(
        executableCodeTemplate,
        propertyName
      );

    const missingKeys =
      requiredKeys.filter(
        (key) =>
          !generatedKeys.includes(key)
      );

    if (missingKeys.length > 0) {
      violations.push(
        `${propertyName} is missing nested keys: ${missingKeys.join(", ")}`
      );
    }
  }

  if (violations.length === 0) {
    return null;
  }

  return (
    "The generated implementation removed required nested return-contract properties. " +
    violations.join("; ") +
    ". Preserve the complete nested object contract from currentTargetSource."
  );
}
function findReturnContractShapeViolation({
  input = null,
  executableCodeTemplate = ""
} = {}) {
  const currentTargetSource =
    safeString(
      input?.currentTargetSource
    );

  const currentShapes =
    extractTopLevelReturnPropertyShapes(
      currentTargetSource
    );

  const generatedShapes =
    extractTopLevelReturnPropertyShapes(
      executableCodeTemplate
    );
  const extractFunctionPropertyParameters = (sourceText) => {
    const parametersByProperty = {};
    const pattern =
      /^\s{4}([A-Za-z_$][\w$]*)\s*:\s*(?:async\s+)?function\s*\(([^)]*)\)/gm;
    let match = null;

    while ((match = pattern.exec(sourceText)) !== null) {
      parametersByProperty[match[1]] = match[2]
        .split(",")
        .map((parameter) => parameter.trim())
        .filter(Boolean);
    }

    return parametersByProperty;
  };

  const comparableProperties =
    Object.keys(currentShapes).filter(
      (property) =>
        currentShapes[property] !==
          "identifier" &&
        currentShapes[property] !==
          "unknown"
    );

  if (
    comparableProperties.length === 0
  ) {
    return null;
  }

  const mismatches =
    comparableProperties
      .filter(
        (property) =>
          Object.prototype.hasOwnProperty.call(
            generatedShapes,
            property
          ) &&
          generatedShapes[property] !==
            currentShapes[property]
      )
      .map(
        (property) => ({
          property,
          expectedType:
            currentShapes[property],
          actualType:
            generatedShapes[property]
        })
      );

  if (mismatches.length > 0) {
    return (
      "The generated complete-function implementation " +
      "changed required top-level return-property types. " +
      "Mismatches: " +
      mismatches
        .map(
          ({
            property,
            expectedType,
            actualType
          }) =>
            `${property} expected ${expectedType} but received ${actualType}`
        )
        .join("; ") +
      ". Preserve the existing return contract value shapes."
    );
  }

  const currentFunctionParameters =
    extractFunctionPropertyParameters(currentTargetSource);
  const generatedFunctionParameters =
    extractFunctionPropertyParameters(executableCodeTemplate);
  const signatureMismatch = Object.keys(currentFunctionParameters)
    .find((property) =>
      Object.prototype.hasOwnProperty.call(
        generatedFunctionParameters,
        property
      ) &&
      JSON.stringify(generatedFunctionParameters[property]) !==
        JSON.stringify(currentFunctionParameters[property])
    );

  if (signatureMismatch) {
    return (
      "The generated complete-function implementation changed the " +
      `parameter contract for return property ${signatureMismatch}. ` +
      `Expected (${currentFunctionParameters[signatureMismatch].join(", ")}) ` +
      `but received (${generatedFunctionParameters[signatureMismatch].join(", ")}). ` +
      "Preserve the verified function-property signature."
    );
  }

  return null;
}

function findRequiredPropertyPreservationViolation({
  input = null,
  executableCodeTemplate = ""
} = {}) {
  const currentTargetSource =
    safeString(
      input?.currentTargetSource
    );

  const requiredProperties =
    extractRequiredReturnProperties(
      currentTargetSource
    );

  if (
    requiredProperties.length === 0
  ) {
    return null;
  }

  const generatedProperties =
    extractRequiredReturnProperties(
      executableCodeTemplate
    );

  if (
    generatedProperties.length === 0
  ) {
    return (
      "The generated complete-function implementation " +
      "does not expose a detectable top-level return-object contract. " +
      "Preserve the current function return-object properties."
    );
  }

  const generatedPropertySet =
    new Set(
      generatedProperties
    );

  const missingProperties =
    requiredProperties.filter(
      (property) =>
        !generatedPropertySet.has(
          property
        )
    );

  if (
    missingProperties.length === 0
  ) {
    return null;
  }

  return (
    "The generated complete-function implementation " +
    "removed required return-object properties from " +
    "the current target contract: " +
    missingProperties.join(", ") +
    ". Preserve these existing top-level properties " +
    "in the replacement function."
  );
}

function findRequiredOutputShapeViolation({
  input = null,
  executableCodeTemplate = ""
} = {}) {
  const requiredOutputShape =
    safeString(
      input?.requiredOutputShape
    ) || "module-fragment";

  const targetSymbol =
    safeString(
      input?.targetSymbol
    );

  if (
    typeof executableCodeTemplate !==
      "string" ||
    executableCodeTemplate.trim().length ===
      0
  ) {
    return "OpenAI did not return executable code.";
  }

  if (
    requiredOutputShape ===
    "complete-function"
  ) {
    if (!targetSymbol) {
      return (
        "The complete-function contract requires " +
        "a concrete target symbol."
      );
    }

    const escapedTargetSymbol =
      targetSymbol.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

    const functionPattern =
      new RegExp(
        "(?:^|\\n)\\s*(?:async\\s+)?" +
        "function\\s+" +
        escapedTargetSymbol +
        "\\s*\\("
      );

    if (
      !functionPattern.test(
        executableCodeTemplate
      )
    ) {
      return (
        "The required complete-function output shape " +
        `was not satisfied for target ${targetSymbol}. ` +
        "Return the complete named function declaration, " +
        "not only statements or an object literal."
      );
    }
  }

  if (
    requiredOutputShape ===
    "statements-only" &&
    (
      /(?:^|\n)\s*(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.test(
        executableCodeTemplate
      ) ||
      /(?:^|\n)\s*class\s+[A-Za-z_$][\w$]*\b/.test(
        executableCodeTemplate
      )
    )
  ) {
    return (
      "The statements-only contract does not allow " +
      "function or class declarations."
    );
  }

  return null;
}

function buildUserPrompt(input) {
  const verifiedLocalAnchorSymbol =
    resolveVerifiedLocalAnchorSymbol(input);

  const requiredOutputShapeConstraints =
    buildRequiredOutputShapeConstraints(
      input
    );

  const functionBodyConstraints =
    buildFunctionBodyConstraints(input);

  const existingLocalDeclarationConstraints =
    input.verifiedLocalAnchor?.anchorType ===
        "function-body-opening" &&
      input.existingLocalDeclarations.length > 0
      ? [
          "The following identifiers are already declared inside the existing target function:",
          ...input.existingLocalDeclarations.map(
            (identifier) =>
              `- ${identifier}`
          ),
          "",
          "Do not redeclare any identifier listed above with const, let, or var.",
          "Reuse an existing identifier only when its current meaning and type are compatible.",
          "When a new local variable is necessary, choose a unique descriptive name that is not listed above."
        ].join("\n")
      : "(not required)";

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
    "Required output shape constraints:",
    requiredOutputShapeConstraints,
    "",
    "Corrective local repair constraints:",
    localRepairConstraints,
    "",
    "Function body insertion constraints:",
    functionBodyConstraints,
    "",
    "Existing local declaration constraints:",
    existingLocalDeclarationConstraints,
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
    "Development principles:",
    input.developmentPrinciples
      ? [
          `Verified target editing: ${input.developmentPrinciples.verifiedTargetEditing ? "required" : "not required"}`,
          `Connect existing runtimes first: ${input.developmentPrinciples.connectExistingRuntimesFirst ? "required" : "not required"}`,
          `Avoid duplicate runtimes: ${input.developmentPrinciples.avoidDuplicateRuntimes ? "required" : "not required"}`,
          `Prefer reuse before creation: ${input.developmentPrinciples.preferReuseBeforeCreation ? "required" : "not required"}`,
          `Measure autonomy over runtime count: ${input.developmentPrinciples.measureAutonomyOverRuntimeCount ? "required" : "not required"}`,
          `Direct execution-path verification: ${input.developmentPrinciples.directExecutionPathVerification ? "required" : "not required"}`,
          `Summarize large verification output: ${input.developmentPrinciples.summarizeLargeVerificationOutput ? "required" : "not required"}`
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

function stripGeneratedCodeComments(
  source = ""
) {
  if (typeof source !== "string") {
    return "";
  }

  return source
    .replace(
      /\/\*[\s\S]*?\*\//g,
      ""
    )
    .replace(
      /^\s*\/\/.*$/gm,
      ""
    )
    .trim();
}

function findRedeclaredExistingLocal({
  input = null,
  executableCodeTemplate = ""
} = {}) {
  const existingLocalDeclarations =
    Array.isArray(
      input?.existingLocalDeclarations
    )
      ? new Set(
          input.existingLocalDeclarations
        )
      : new Set();

  if (
    existingLocalDeclarations.size === 0 ||
    typeof executableCodeTemplate !==
      "string"
  ) {
    return null;
  }

  const declarations =
    Array.from(
      executableCodeTemplate.matchAll(
        /(?:^|\n)\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\b/g
      ),
      (match) =>
        match[1]
    );

  return (
    declarations.find(
      (identifier) =>
        existingLocalDeclarations.has(
          identifier
        )
    ) || null
  );
}

function findIllustrativeImplementationViolation(
  executableCodeTemplate = "",
  context = null
) {
  if (
    typeof executableCodeTemplate !==
      "string" ||
    executableCodeTemplate.trim().length ===
      0
  ) {
    return null;
  }

  const implementationTemplateBlock =
    executableCodeTemplate.match(
      /implementationTemplate\s*:\s*\{[\s\S]{0,1600}?\}/i
    )?.[0] || "";

  const schemaPlaceholderPatterns = [
    /\btargetSymbol\s*:\s*["'`]string["'`]/i,
    /\bsymbolType\s*:\s*["'`]string["'`]/i,
    /\bexpectedBehavior\s*:\s*["'`]string\[\]["'`]/i,
    /\bimplementationTemplate\s*:\s*["'`]string["'`]/i,
    /\bexecutableCodeTemplate\s*:\s*["'`]string["'`]/i
  ];

  const schemaPlaceholderCount =
    schemaPlaceholderPatterns.filter(
      (pattern) =>
        pattern.test(
          implementationTemplateBlock
        )
    ).length;

  const selfReferentialTargetSymbol =
    typeof context?.targetSymbol === "string"
      ? context.targetSymbol.trim()
      : "";

  const escapedSelfReferentialTargetSymbol =
    selfReferentialTargetSymbol
      ? selfReferentialTargetSymbol.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        )
      : "";

  const selfReferentialTemplatePattern =
    escapedSelfReferentialTargetSymbol
      ? new RegExp(
          [
            "(?:implementationTemplate|executableCodeTemplate)",
            "\\s*:\\s*",
            "[\"'`]",
            "[\\s\\S]{0,240}",
            "(?:async\\s+)?function\\s+",
            escapedSelfReferentialTargetSymbol,
            "\\s*\\("
          ].join(""),
          "i"
        )
      : null;

  const indicators = [
    {
      name:
        "unresolved-angle-placeholder",
      matched:
        /<\s*(?:target symbol name|symbol type(?:\s*,\s*e\.?g\.?\s*,?\s*function)?|describe expected behavior(?:\s+in detail)?|(?:implementation|code|executable code) template(?:\s+for implementation)?)\s*>/i.test(
          executableCodeTemplate
        ),
      weight: 5
    },
    {
      name:
        "self-referential-code-template",
      matched:
        Boolean(
          selfReferentialTemplatePattern &&
          selfReferentialTemplatePattern.test(
            executableCodeTemplate
          )
        ),
      weight: 5
    },
    {
      name:
        "schema-placeholder-bundle",
      matched:
        schemaPlaceholderCount >= 3,
      weight: 5
    },
    {
      name:
        "example-target-symbol",
      matched:
        /\bexampleTargetSymbol\b/i.test(
          executableCodeTemplate
        ),
      weight: 3
    },
    {
      name:
        "example-output",
      matched:
        /\bExample output\b/i.test(
          executableCodeTemplate
        ),
      weight: 3
    },
    {
      name:
        "implement-function-logic",
      matched:
        /Implement the function logic here/i.test(
          executableCodeTemplate
        ),
      weight: 2
    },
    {
      name:
        "fixed-example-string",
      matched:
        /fixed example string/i.test(
          executableCodeTemplate
        ),
      weight: 2
    },
    {
      name:
        "demonstrate-implementation",
      matched:
        /demonstrate implementation/i.test(
          executableCodeTemplate
        ),
      weight: 2
    },
    {
      name:
        "sample-implementation",
      matched:
        /sample implementation/i.test(
          executableCodeTemplate
        ),
      weight: 2
    },
    {
      name:
        "placeholder-implementation",
      matched:
        /placeholder implementation/i.test(
          executableCodeTemplate
        ),
      weight: 2
    },
    {
      name:
        "throw-only-unimplemented-stub",
      matched:
        /throw\s+new\s+Error\s*\(\s*["'`][^"'`]*\bnot implemented\b[^"'`]*["'`]\s*\)/i.test(
          executableCodeTemplate
        ),
      weight: 5
    }
  ];

  const matchedIndicators =
    indicators.filter(
      (indicator) =>
        indicator.matched
    );

  const score =
    matchedIndicators.reduce(
      (total, indicator) =>
        total + indicator.weight,
      0
    );

  if (score < 4) {
    return null;
  }

  return {
    score,
    indicators:
      matchedIndicators.map(
        (indicator) =>
          indicator.name
      )
  };
}

function findInventedRuntimeDependencyViolation({
  input = null,
  executableCodeTemplate = ""
} = {}) {
  if (
    typeof executableCodeTemplate !==
      "string" ||
    executableCodeTemplate.trim().length ===
      0
  ) {
    return null;
  }

  const indicators = [
    {
      name:
        "assumed-runtime-helper",
      pattern:
        /assumed to be available in (?:the )?runtime context/i
    },
    {
      name:
        "delegation-stub",
      pattern:
        /stub representing (?:the )?delegation/i
    },
    {
      name:
        "placeholder-resolution-logic",
      pattern:
        /placeholder for actual (?:resolution )?logic/i
    },
    {
      name:
        "synthetic-provider-result",
      pattern:
        /Implementation generated for \${/i
    },
    {
      name:
        "invented-provider-helper",
      pattern:
        /function\s+generateImplementationFromProvider\s*\(/i
    },
    {
      name:
        "invented-symbol-resolver",
      pattern:
        /function\s+resolveConcreteSymbol\s*\(/i
    },
    {
      name:
        "invented-symbol-describer",
      pattern:
        /function\s+describeSymbol\s*\(/i
    },
    {
      name:
        "invented-validator-requirements-helper",
      pattern:
        /function\s+getPatchValidatorRequirements\s*\(/i
    }
  ];

  const matchedIndicators =
    indicators
      .filter(
        (indicator) =>
          indicator.pattern.test(
            executableCodeTemplate
          )
      )
      .map(
        (indicator) =>
          indicator.name
      );

  if (matchedIndicators.length > 0) {
    return (
      "The generated implementation introduced invented " +
      "runtime dependencies or stub helper behavior. " +
      "Detected indicators: " +
      matchedIndicators.join(", ") +
      ". Use only identifiers and dependencies that already " +
      "exist in currentTargetSource or are explicitly provided " +
      "by the task."
    );
  }

  const completeTargetSource =
    safeString(
      input?.completeTargetSource
    );

  const currentTargetSource =
    safeString(
      input?.currentTargetSource
    );

  const existingLocalDeclarations =
    Array.isArray(
      input?.existingLocalDeclarations
    )
      ? input.existingLocalDeclarations
          .filter(
            (value) =>
              typeof value === "string" &&
              value.trim().length > 0
          )
          .map(
            (value) =>
              value.trim()
          )
      : [];

  const currentFunctionParameters = new Set();
  const functionParameterPattern =
    /\bfunction(?:\s+[A-Za-z_$][\w$]*)?\s*\(([^)]*)\)/g;
  let functionParameterMatch = null;

  while (
    (functionParameterMatch =
      functionParameterPattern.exec(currentTargetSource)) !== null
  ) {
    for (const parameter of functionParameterMatch[1].split(",")) {
      const normalizedParameter = parameter.trim();
      if (/^[A-Za-z_$][\w$]*$/.test(normalizedParameter)) {
        currentFunctionParameters.add(normalizedParameter);
      }
    }
  }

  const inventedParameterMembers = [];

  for (const parameter of currentFunctionParameters) {
    const escapedParameter = parameter.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );
    const memberPattern = new RegExp(
      `\\b${escapedParameter}\\s*(?:\\?\\.|\\.)\\s*([A-Za-z_$][\\w$]*)`,
      "g"
    );
    const currentMembers = new Set();
    const generatedMembers = new Set();
    let memberMatch = null;

    while ((memberMatch = memberPattern.exec(currentTargetSource)) !== null) {
      currentMembers.add(memberMatch[1]);
    }

    memberPattern.lastIndex = 0;
    while ((memberMatch = memberPattern.exec(completeTargetSource)) !== null) {
      currentMembers.add(memberMatch[1]);
    }

    if (currentMembers.size === 0) {
      continue;
    }

    memberPattern.lastIndex = 0;
    while ((memberMatch = memberPattern.exec(executableCodeTemplate)) !== null) {
      generatedMembers.add(memberMatch[1]);
    }

    for (const member of generatedMembers) {
      if (!currentMembers.has(member)) {
        inventedParameterMembers.push(`${parameter}.${member}`);
      }
    }
  }

  if (inventedParameterMembers.length > 0) {
    return (
      "The generated implementation introduced unverified member access " +
      "on an existing function parameter. Detected members: " +
      inventedParameterMembers.join(", ") +
      ". Preserve the verified parameter API contract from " +
      "currentTargetSource or completeTargetSource."
    );
  }

  const declaredIdentifiers =
    new Set(
      existingLocalDeclarations
    );

  const reservedWords =
    new Set([
      "await",
      "break",
      "case",
      "catch",
      "class",
      "const",
      "continue",
      "debugger",
      "default",
      "delete",
      "do",
      "else",
      "export",
      "extends",
      "false",
      "finally",
      "for",
      "function",
      "if",
      "import",
      "in",
      "instanceof",
      "let",
      "new",
      "null",
      "of",
      "return",
      "static",
      "super",
      "switch",
      "this",
      "throw",
      "true",
      "try",
      "typeof",
      "undefined",
      "var",
      "void",
      "while",
      "with",
      "yield",
      "async"
    ]);

  const knownGlobals =
    new Set([
      "Array",
      "ArrayBuffer",
      "BigInt",
      "Boolean",
      "Buffer",
      "Date",
      "Error",
      "EvalError",
      "Function",
      "Infinity",
      "Intl",
      "JSON",
      "Map",
      "Math",
      "NaN",
      "Number",
      "Object",
      "Promise",
      "RangeError",
      "ReferenceError",
      "Reflect",
      "RegExp",
      "Set",
      "String",
      "Symbol",
      "SyntaxError",
      "TypeError",
      "URIError",
      "URL",
      "URLSearchParams",
      "WeakMap",
      "WeakSet",
      "clearImmediate",
      "clearInterval",
      "clearTimeout",
      "console",
      "decodeURI",
      "decodeURIComponent",
      "encodeURI",
      "encodeURIComponent",
      "global",
      "globalThis",
      "isFinite",
      "isNaN",
      "parseFloat",
      "parseInt",
      "process",
      "queueMicrotask",
      "require",
      "setImmediate",
      "setInterval",
      "setTimeout"
    ]);

  const declarationSources =
    [
      completeTargetSource,
      currentTargetSource,
      executableCodeTemplate
    ]
      .filter(Boolean)
      .join("\n");

  const simpleDeclarationPattern =
    /\b(?:const|let|var|class|function)\s+([A-Za-z_$][\w$]*)/g;

  let declarationMatch = null;

  while (
    (
      declarationMatch =
        simpleDeclarationPattern.exec(
          declarationSources
        )
    ) !== null
  ) {
    declaredIdentifiers.add(
      declarationMatch[1]
    );
  }

  const importDefaultPattern =
    /(?:^|\n)\s*import\s+([A-Za-z_$][\w$]*)\s+from\s+["']/g;

  while (
    (
      declarationMatch =
        importDefaultPattern.exec(
          completeTargetSource
        )
    ) !== null
  ) {
    declaredIdentifiers.add(
      declarationMatch[1]
    );
  }

  const importNamespacePattern =
    /(?:^|\n)\s*import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+["']/g;

  while (
    (
      declarationMatch =
        importNamespacePattern.exec(
          completeTargetSource
        )
    ) !== null
  ) {
    declaredIdentifiers.add(
      declarationMatch[1]
    );
  }

  const importNamedPattern =
    /(?:^|\n)\s*import\s*\{([^}]*)\}\s*from\s*["']/g;

  while (
    (
      declarationMatch =
        importNamedPattern.exec(
          completeTargetSource
        )
    ) !== null
  ) {
    const importedItems =
      declarationMatch[1].split(",");

    for (const importedItem of importedItems) {
      const normalized =
        importedItem.trim();

      if (!normalized) {
        continue;
      }

      const aliasMatch =
        /^(?:[A-Za-z_$][\w$]*\s+as\s+)?([A-Za-z_$][\w$]*)$/.exec(
          normalized
        );

      if (aliasMatch) {
        declaredIdentifiers.add(
          aliasMatch[1]
        );
      }
    }
  }

  const parameterPatterns = [
    /\b(?:async\s+)?function(?:\s*\*)?\s*[A-Za-z_$]*[\w$]*\s*\(([^)]*)\)/g,
    /\(([^)]*)\)\s*=>/g
  ];

  for (
    const parameterPattern
    of parameterPatterns
  ) {
    let parameterMatch = null;

    while (
      (
        parameterMatch =
          parameterPattern.exec(
            declarationSources
          )
      ) !== null
    ) {
      const identifiers =
        parameterMatch[1]
          .match(
            /[A-Za-z_$][\w$]*/g
          ) || [];

      for (const identifier of identifiers) {
        if (
          !reservedWords.has(identifier) &&
          !knownGlobals.has(identifier)
        ) {
          declaredIdentifiers.add(
            identifier
          );
        }
      }
    }
  }

  const sanitized = [];

  let mode =
    "code";

  let templateExpressionDepth =
    0;

  let regexCharacterClass =
    false;

  const isLikelyRegexStart =
    (source, slashIndex) => {
      let previousIndex =
        slashIndex - 1;

      while (
        previousIndex >= 0 &&
        /\s/.test(source[previousIndex])
      ) {
        previousIndex -= 1;
      }

      if (previousIndex < 0) {
        return true;
      }

      const previousCharacter =
        source[previousIndex];

      if (
        "([{:;,=!?&|+-*%^~<>".includes(
          previousCharacter
        )
      ) {
        return true;
      }

      const prefix =
        source.slice(
          0,
          previousIndex + 1
        );

      const previousWord =
        /([A-Za-z_$][\w$]*)\s*$/.exec(
          prefix
        )?.[1] || "";

      return [
        "return",
        "case",
        "throw",
        "else",
        "do",
        "typeof",
        "instanceof",
        "in",
        "of",
        "yield",
        "await"
      ].includes(previousWord);
    };

  for (
    let index = 0;
    index < executableCodeTemplate.length;
    index += 1
  ) {
    const character =
      executableCodeTemplate[index];

    const next =
      executableCodeTemplate[
        index + 1
      ] || "";

    if (mode === "line-comment") {
      if (character === "\n") {
        sanitized.push("\n");
        mode = "code";
      } else {
        sanitized.push(" ");
      }

      continue;
    }

    if (mode === "block-comment") {
      if (
        character === "*" &&
        next === "/"
      ) {
        sanitized.push(
          " ",
          " "
        );

        index += 1;
        mode = "code";
      } else {
        sanitized.push(
          character === "\n"
            ? "\n"
            : " "
        );
      }

      continue;
    }

    if (
      mode === "single-string" ||
      mode === "double-string"
    ) {
      const quote =
        mode === "single-string"
          ? "'"
          : '"';

      if (character === "\\") {
        sanitized.push(" ");

        if (
          index + 1 <
          executableCodeTemplate.length
        ) {
          sanitized.push(" ");
          index += 1;
        }
      } else if (
        character === quote
      ) {
        sanitized.push(" ");

        mode =
          templateExpressionDepth > 0
            ? "template-expression"
            : "code";
      } else {
        sanitized.push(
          character === "\n"
            ? "\n"
            : " "
        );
      }

      continue;
    }

    if (mode === "regex") {
      if (character === "\\") {
        sanitized.push(" ");

        if (
          index + 1 <
          executableCodeTemplate.length
        ) {
          sanitized.push(" ");
          index += 1;
        }
      } else if (character === "[") {
        regexCharacterClass =
          true;
        sanitized.push(" ");
      } else if (
        character === "]" &&
        regexCharacterClass
      ) {
        regexCharacterClass =
          false;
        sanitized.push(" ");
      } else if (
        character === "/" &&
        !regexCharacterClass
      ) {
        sanitized.push(" ");
        mode =
          templateExpressionDepth > 0
            ? "template-expression"
            : "code";
      } else {
        sanitized.push(
          character === "\n"
            ? "\n"
            : " "
        );
      }

      continue;
    }

    if (mode === "template") {
      if (character === "\\") {
        sanitized.push(" ");

        if (
          index + 1 <
          executableCodeTemplate.length
        ) {
          sanitized.push(" ");
          index += 1;
        }
      } else if (
        character === "`"
      ) {
        sanitized.push(" ");
        mode = "code";
      } else if (
        character === "$" &&
        next === "{"
      ) {
        sanitized.push(
          " ",
          "{"
        );

        index += 1;

        templateExpressionDepth =
          1;

        mode =
          "template-expression";
      } else {
        sanitized.push(
          character === "\n"
            ? "\n"
            : " "
        );
      }

      continue;
    }

    const inTemplateExpression =
      mode ===
      "template-expression";

    if (
      character === "/" &&
      next !== "/" &&
      next !== "*" &&
      isLikelyRegexStart(
        executableCodeTemplate,
        index
      )
    ) {
      sanitized.push(" ");
      regexCharacterClass =
        false;
      mode = "regex";
      continue;
    }

    if (
      character === "/" &&
      next === "/"
    ) {
      sanitized.push(
        " ",
        " "
      );

      index += 1;
      mode = "line-comment";

      continue;
    }

    if (
      character === "/" &&
      next === "*"
    ) {
      sanitized.push(
        " ",
        " "
      );

      index += 1;
      mode = "block-comment";

      continue;
    }

    if (character === "'") {
      sanitized.push(" ");
      mode = "single-string";
      continue;
    }

    if (character === '"') {
      sanitized.push(" ");
      mode = "double-string";
      continue;
    }

    if (
      character === "`" &&
      !inTemplateExpression
    ) {
      sanitized.push(" ");
      mode = "template";
      continue;
    }

    if (inTemplateExpression) {
      if (character === "{") {
        templateExpressionDepth +=
          1;
      }

      if (character === "}") {
        templateExpressionDepth -=
          1;

        if (
          templateExpressionDepth ===
          0
        ) {
          sanitized.push(" ");

          mode =
            "template";

          continue;
        }
      }
    }

    sanitized.push(
      character
    );
  }

  const executableSource =
    sanitized.join("");

  const unresolvedCalls =
    new Set();

  const callPattern =
    /\b([A-Za-z_$][\w$]*)\s*\(/g;

  let callMatch = null;

  while (
    (
      callMatch =
        callPattern.exec(
          executableSource
        )
    ) !== null
  ) {
    const identifier =
      callMatch[1];

    let previousIndex =
      callMatch.index - 1;

    while (
      previousIndex >= 0 &&
      /\s/.test(
        executableSource[
          previousIndex
        ]
      )
    ) {
      previousIndex -= 1;
    }

    if (
      previousIndex >= 0 &&
      executableSource[
        previousIndex
      ] === "."
    ) {
      continue;
    }

    if (
      reservedWords.has(
        identifier
      ) ||
      knownGlobals.has(
        identifier
      ) ||
      declaredIdentifiers.has(
        identifier
      )
    ) {
      continue;
    }

    unresolvedCalls.add(
      identifier
    );
  }

  if (
    unresolvedCalls.size === 0
  ) {
    return null;
  }

  return (
    "The generated implementation introduced invented runtime " +
    "dependencies or stub helper behavior. " +
    "Detected undeclared runtime calls: " +
    [...unresolvedCalls].join(", ") +
    ". Use verified currentTargetSource, completeTargetSource, " +
    "and existingLocalDeclarations instead of inventing " +
    "runtime dependencies."
  );
}

function runReturnContractShapeSemanticSmoke() {
  const currentTargetSource = [
    "function resolveImplementationProvider() {",
    "  return {",
    "    providerConfigured: true",
    "  };",
    "}"
  ].join("\n");

  const acceptedBooleanExpressions = [
    [
      "function resolveImplementationProvider() {",
      "  const provider = () => null;",
      "  return {",
      "    providerConfigured:",
      '      provider !== null && typeof provider === "function"',
      "  };",
      "}"
    ].join("\n"),
    [
      "function resolveImplementationProvider() {",
      "  const provider = () => null;",
      "  return {",
      "    providerConfigured:",
      "      provider instanceof Function",
      "  };",
      "}"
    ].join("\n")
  ];

  for (
    const executableCodeTemplate
    of acceptedBooleanExpressions
  ) {
    const violation =
      findReturnContractShapeViolation({
        input: {
          currentTargetSource
        },
        executableCodeTemplate
      });

    if (violation !== null) {
      return (
        "Boolean return-expression semantic smoke failed: " +
        violation
      );
    }
  }

  const rejectedTypeChange =
    findReturnContractShapeViolation({
      input: {
        currentTargetSource
      },
      executableCodeTemplate: [
        "function resolveImplementationProvider() {",
        "  return {",
        '    providerConfigured: "yes"',
        "  };",
        "}"
      ].join("\n")
    });

  if (
    typeof rejectedTypeChange !== "string" ||
    !rejectedTypeChange.includes(
      "providerConfigured expected boolean but received string"
    )
  ) {
    return (
      "Return-shape semantic smoke failed to reject " +
      "a real boolean-to-string contract change."
    );
  }

  return null;
}
function runInventedRuntimeDependencySemanticSmoke() {
  const makeInput = ({
    moduleSource =
      "function target() {}",
    targetSource =
      "function target() {}",
    locals = []
  } = {}) => ({
    completeTargetSource:
      moduleSource,
    currentTargetSource:
      targetSource,
    existingLocalDeclarations:
      locals
  });

  const cases = [
    {
      name:
        "accept existing local call",
      input:
        makeInput({
          targetSource:
            "function target() {\n  const helper = () => null;\n}"
        }),
      code:
        "helper();",
      shouldReject:
        false
    },
    {
      name:
        "accept explicit existing local",
      input:
        makeInput({
          locals:
            ["helper"]
        }),
      code:
        "helper();",
      shouldReject:
        false
    },
    {
      name:
        "accept module function declaration",
      input:
        makeInput({
          moduleSource:
            "function helper() { return null; }\nfunction target() {}"
        }),
      code:
        "helper();",
      shouldReject:
        false
    },
    {
      name:
        "accept esm import",
      input:
        makeInput({
          moduleSource:
            "import path from \"node:path\";\nfunction target() {}"
        }),
      code:
        "path.resolve(\"a\");",
      shouldReject:
        false
    },
    {
      name:
        "accept module const",
      input:
        makeInput({
          moduleSource:
            "const helper = () => null;\nfunction target() {}"
        }),
      code:
        "helper();",
      shouldReject:
        false
    },
    {
      name:
        "accept member property",
      input:
        makeInput({
          locals:
            ["input"]
        }),
      code:
        "input.value;",
      shouldReject:
        false
    },
    {
      name:
        "reject truly missing helper",
      input:
        makeInput(),
      code:
        "inventedHelper();",
      shouldReject:
        true
    },
    {
      name:
        "ignore identifier in string",
      input:
        makeInput(),
      code:
        "const value = \"inventedHelper()\";",
      shouldReject:
        false
    },
    {
      name:
        "ignore identifier in comment",
      input:
        makeInput(),
      code:
        "// inventedHelper();\nreturn null;",
      shouldReject:
        false
    },
    {
      name:
        "ignore call-shaped text in regex literal",
      input:
        makeInput(),
      code:
        "const pattern = /stub representing (?:the )?delegation/i;",
      shouldReject:
        false
    },
    {
      name:
        "ignore escaped call-shaped text in regex literal",
      input:
        makeInput(),
      code:
        "const pattern = /\\bactual\\s*\\(/g;",
      shouldReject:
        false
    },
    {
      name:
        "still reject missing call after regex literal",
      input:
        makeInput(),
      code:
        "const pattern = /inventedHelper\\(\\)/; inventedHelper();",
      shouldReject:
        true
    },
    {
      name:
        "do not confuse division with regex literal",
      input:
        makeInput({
          locals:
            ["total"]
        }),
      code:
        "const ratio = total / inventedHelper();",
      shouldReject:
        true
    },
    {
      name:
        "detect template interpolation dependency",
      input:
        makeInput(),
      code:
        "const value = `${inventedHelper()}`;",
      shouldReject:
        true
    },
    {
      name:
        "accept declared template interpolation",
      input:
        makeInput({
          locals:
            ["helper"]
        }),
      code:
        "const value = `${helper()}`;",
      shouldReject:
        false
    }
  ];

  const failures = [];

  for (const testCase of cases) {
    const violation =
      findInventedRuntimeDependencyViolation({
        input:
          testCase.input,
        executableCodeTemplate:
          testCase.code
      });

    const rejected =
      typeof violation ===
        "string" &&
      violation.length > 0;

    if (
      rejected !==
      testCase.shouldReject
    ) {
      failures.push(
        `${testCase.name}: expected reject=${testCase.shouldReject} ` +
        `but received reject=${rejected}`
      );
    }
  }

  if (failures.length === 0) {
    return null;
  }

  return (
    "Invented-runtime dependency semantic smoke failed: " +
    failures.join(" | ")
  );
}

function findReturnContractReconstructionViolation({
  input = null,
  executableCodeTemplate = ""
} = {}) {
  const currentTargetSource =
    safeString(
      input?.currentTargetSource
    );

  const generatedSource =
    safeString(
      executableCodeTemplate
    );

  if (
    !currentTargetSource ||
    !generatedSource
  ) {
    return null;
  }

  const currentHasDirectImplementationTemplate =
    /return\s*\{[\s\S]*?\bimplementationTemplate\s*:\s*\{/m.test(
      currentTargetSource
    );

  if (!currentHasDirectImplementationTemplate) {
    return null;
  }

  const generatedHasDirectImplementationTemplate =
    /return\s*\{[\s\S]*?\bimplementationTemplate\s*:\s*\{/m.test(
      generatedSource
    );

  const hoistedImplementationTemplate =
    /\b(?:const|let|var)\s+implementationTemplate\s*=\s*\{/m.test(
      generatedSource
    );

  const spreadImplementationTemplate =
    /\.\.\.\s*implementationTemplate\b/m.test(
      generatedSource
    );

  if (
    generatedHasDirectImplementationTemplate &&
    !hoistedImplementationTemplate &&
    !spreadImplementationTemplate
  ) {
    return null;
  }

  return [
    "The generated implementation reconstructed the return contract instead of preserving it directly.",
    "Keep implementationTemplate as a direct object-literal property inside the returned object.",
    "Do not hoist implementationTemplate into a local variable.",
    "Do not use object spread to rebuild the required return contract."
  ].join(" ");
}
function findImmediateGenerationViolation({
  input = null,
  executableCodeTemplate = ""
} = {}) {
  const verifiedTargetSource =
    safeString(
      input?.currentTargetSource || input?.verifiedLocalAnchor?.pattern
    );

  const normalizedGeneratedSource =
    executableCodeTemplate
      .replace(/\s+/g, " ")
      .trim();

  const normalizedVerifiedTargetSource =
    verifiedTargetSource
      .replace(/\s+/g, " ")
      .trim();

  if (
    normalizedGeneratedSource &&
    normalizedVerifiedTargetSource &&
    normalizedGeneratedSource ===
      normalizedVerifiedTargetSource
  ) {
    return (
      "The generated implementation is identical to the verified target source. " +
      "Produce a concrete behavioral improvement instead of returning unchanged code."
    );
  }

  const outputShapeViolation =
    findRequiredOutputShapeViolation({
      input,
      executableCodeTemplate
    });

  if (outputShapeViolation) {
    return outputShapeViolation;
  }

  const completeFunctionContractRequired =
    safeString(
      input?.requiredOutputShape
    ) === "complete-function";

  const returnContractReconstructionViolation =
    completeFunctionContractRequired
      ? findReturnContractReconstructionViolation({
          input,
          executableCodeTemplate
        })
      : null;

  if (returnContractReconstructionViolation) {
    return returnContractReconstructionViolation;
  }

  const nestedReturnContractViolation =
    completeFunctionContractRequired
      ? findNestedReturnContractViolation({
          input,
          executableCodeTemplate
        })
      : null;

  if (nestedReturnContractViolation) {
    return nestedReturnContractViolation;
  }

  const returnContractShapeViolation =
    completeFunctionContractRequired
      ? findReturnContractShapeViolation({
          input,
          executableCodeTemplate
        })
      : null;

  if (returnContractShapeViolation) {
    return returnContractShapeViolation;
  }

  const requiredPropertyViolation =
    completeFunctionContractRequired
      ? findRequiredPropertyPreservationViolation({
          input,
          executableCodeTemplate
        })
      : null;

  if (requiredPropertyViolation) {
    return requiredPropertyViolation;
  }

  const inventedDependencyContractRequired =
    completeFunctionContractRequired &&
    safeString(input?.targetSymbol) ===
      "findInventedRuntimeDependencyViolation";

  if (inventedDependencyContractRequired) {
    const requiredExistingIndicators = [
      "assumed-runtime-helper",
      "delegation-stub",
      "placeholder-resolution-logic",
      "synthetic-provider-result",
      "invented-provider-helper",
      "invented-symbol-resolver",
      "invented-symbol-describer",
      "invented-validator-requirements-helper"
    ];

    const missingExistingIndicators =
      requiredExistingIndicators.filter(
        (indicator) =>
          !executableCodeTemplate.includes(
            indicator
          )
      );

    if (missingExistingIndicators.length > 0) {
      return (
        "The generated complete-function implementation removed " +
        "required existing invented-runtime safety indicators: " +
        missingExistingIndicators.join(", ") +
        ". Preserve the existing validator contract and extend it narrowly."
      );
    }

    if (/\breturn\s*\{/.test(executableCodeTemplate)) {
      return (
        "The generated invented-runtime dependency validator changed " +
        "its null-or-human-readable-string return contract. " +
        "Preserve the existing return contract."
      );
    }

    const requiredVerifiedContextProperties = [
      "completeTargetSource",
      "currentTargetSource",
      "existingLocalDeclarations"
    ];

    const hasVerifiedInputPropertyAccess =
      (propertyName) => {
        const escapedPropertyName =
          propertyName.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          );

        const propertyAccessPattern =
          new RegExp(
            `\\binput\\s*\\?*\\.\\s*${escapedPropertyName}\\b`
          );

        return propertyAccessPattern.test(
          executableCodeTemplate
        );
      };

    const missingVerifiedContextReferences =
      requiredVerifiedContextProperties.filter(
        (propertyName) =>
          !hasVerifiedInputPropertyAccess(
            propertyName
          )
      );

    if (missingVerifiedContextReferences.length > 0) {
      return (
        "The generated invented-runtime dependency validator did not " +
        "use required verified provider input references: " +
        missingVerifiedContextReferences.join(", ") +
        ". Read verified repository evidence through input rather than " +
        "inventing additional function parameters."
      );
    }

    const generatedFunctionSignature =
      executableCodeTemplate.match(
        /function\s+findInventedRuntimeDependencyViolation\s*\(\s*\{([\s\S]*?)\}\s*=\s*\{\}\s*\)/
      )?.[1] ||
      "";

    const inventedContextParameters = [
      "completeTargetSource",
      "currentTargetSource",
      "existingLocalDeclarations"
    ].filter(
      (name) =>
        new RegExp(
          `(?:^|,|\\n)\\s*${name}\\s*(?:=|,|$)`
        ).test(
          generatedFunctionSignature
        )
    );

    if (inventedContextParameters.length > 0) {
      return (
        "The generated invented-runtime dependency validator invented " +
        "provider-context function parameters: " +
        inventedContextParameters.join(", ") +
        ". Keep only the existing input and executableCodeTemplate " +
        "function arguments and read context from input."
      );
    }

    const changedIndicatorMatchSemantics =
      /matchedIndicators\.length\s*(?:<|<=|>|>=|===|==|!==|!=)\s*[2-9]\d*/.test(
        executableCodeTemplate
      );

    if (changedIndicatorMatchSemantics) {
      return (
        "The generated invented-runtime dependency validator changed " +
        "existing invented-runtime indicator match semantics. " +
        "Preserve the existing behavior where any matched safety " +
        "indicator produces a violation."
      );
    }

    const requiredIndicatorPatternFragments = [
      "Implementation generated for",
      "generateImplementationFromProvider",
      "resolveConcreteSymbol",
      "describeSymbol",
      "getPatchValidatorRequirements"
    ];

    const missingIndicatorPatternFragments =
      requiredIndicatorPatternFragments.filter(
        (fragment) =>
          !executableCodeTemplate.includes(
            fragment
          )
      );

    if (missingIndicatorPatternFragments.length > 0) {
      return (
        "The generated invented-runtime dependency validator changed " +
        "existing invented-runtime indicator detection behavior. " +
        "Preserve the existing indicator patterns. Missing pattern " +
        "fragments: " +
        missingIndicatorPatternFragments.join(", ") +
        "."
      );
    }

    const templateLiteralRemovingRegex =
      executableCodeTemplate.match(
        /const\s+([A-Za-z_$][\w$]*)\s*=\s*\/[^;\n]*`[^;\n]*`[^;\n]*\/[a-z]*;/
      );

    const removesWholeTemplateLiteral =
      Boolean(
        templateLiteralRemovingRegex &&
        new RegExp(
          "\\.replace\\(\\s*" +
            templateLiteralRemovingRegex[1] +
            "\\s*,"
        ).test(
          executableCodeTemplate
        )
      );

    if (removesWholeTemplateLiteral) {
      return (
        "The generated invented-runtime dependency validator removes " +
        "whole template literals while scanning executable identifiers. " +
        "Preserve executable identifiers inside template-literal " +
        "interpolation expressions."
      );
    }
  }

  const inventedRuntimeDependency =
    findInventedRuntimeDependencyViolation({
      input,
      executableCodeTemplate
    });

  if (inventedRuntimeDependency) {
    return inventedRuntimeDependency;
  }

  const illustrativeImplementation =
    findIllustrativeImplementationViolation(
      executableCodeTemplate,
      {
        targetSymbol:
          input?.targetSymbol || null
      }
    );

  if (illustrativeImplementation) {
    return (
      "The generated implementation appears to be an " +
      "illustrative example or placeholder rather than " +
      "a concrete implementation. Detected indicators: " +
      illustrativeImplementation.indicators.join(", ") +
      "."
    );
  }

  const functionBodyInsertion =
    input?.verifiedLocalAnchor?.anchorType ===
      "function-body-opening";

  if (!functionBodyInsertion) {
    return null;
  }

  if (
    executableCodeTemplate.trim().length > 0 &&
    stripGeneratedCodeComments(
      executableCodeTemplate
    ).length === 0
  ) {
    return (
      "The generated implementation contains only comments " +
      "and no executable statements."
    );
  }

  const redeclaredExistingLocal =
    findRedeclaredExistingLocal({
      input,
      executableCodeTemplate
    });

  if (redeclaredExistingLocal) {
    return (
      "The generated implementation redeclares existing " +
      `local identifier ${redeclaredExistingLocal}. ` +
      "Reuse it safely or choose a unique new identifier."
    );
  }

  if (
    /(?:^|\n)\s*(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.test(
      executableCodeTemplate
    ) ||
    /(?:^|\n)\s*class\s+[A-Za-z_$][\w$]*\b/.test(
      executableCodeTemplate
    )
  ) {
    return (
      "The generated implementation contains a function or " +
      "class declaration instead of statements for the " +
      "existing function body."
    );
  }

  const currentTargetSource =
    safeString(
      input?.currentTargetSource
    );

  const generatedFunctionPrefix =
    /^\s*async\s+function\s*\*/.test(
      currentTargetSource
    )
      ? "async function* __ashGeneratedBodySyntaxProbe() {"
      : /^\s*async\s+function\b/.test(
          currentTargetSource
        )
        ? "async function __ashGeneratedBodySyntaxProbe() {"
        : /^\s*function\s*\*/.test(
            currentTargetSource
          )
          ? "function* __ashGeneratedBodySyntaxProbe() {"
          : "function __ashGeneratedBodySyntaxProbe() {";

  try {
    new Function(
      `${generatedFunctionPrefix}\n${executableCodeTemplate}\n}`
    );
  } catch (error) {
    return (
      "The generated implementation is not valid JavaScript " +
      "for insertion inside the existing function body. " +
      `Syntax error: ${
        safeString(error?.message) ||
        "unknown syntax error"
      }.`
    );
  }
  return null;
}

function buildViolationCorrectionGuidance(
  violation = "",
  input = null
) {
  const normalizedOperation =
    safeString(
      input?.recommendedOperation
    ).toLowerCase();

  const normalizedOutputShape =
    safeString(
      input?.requiredOutputShape
    ).toLowerCase();

  const localInsertOperation =
    normalizedOperation === "insert-before" ||
    normalizedOperation === "insert-after";

  const statementsOnlyOutput =
    normalizedOutputShape === "statements-only";

  const normalizedViolation =
    safeString(violation).toLowerCase();

  const requiredReturnProperties =
    extractRequiredReturnProperties(
      safeString(
        input?.currentTargetSource
      )
    );

  if (
    normalizedViolation.includes(
      "self-referential-code-template"
    )
  ) {
    return [
      "Specific correction for self-referential code generation:",
      "- Return the actual replacement implementation itself.",
      "- Do not return code that generates, describes, serializes, or stores another implementation.",
      "- Do not assign a function source string to implementationTemplate or executableCodeTemplate.",
      "- Do not construct a template literal containing the target function.",
      "- Do not call a code-generation helper from the returned function.",
      "- The executableCodeTemplate JSON field is only the transport field. Its value must be the real replacement function source.",
      "- Begin that value directly with the required target function declaration.",
      "- Preserve the existing return-object contract from currentTargetSource."
    ].join("\n");
  }
  if (
    normalizedViolation.includes(
      "reconstructed the return contract"
    ) ||
    normalizedViolation.includes(
      "keep implementationtemplate as a direct object-literal property"
    )
  ) {
    return [
      "Specific correction for direct return-contract preservation:",
      "- Start by copying currentTargetSource exactly.",
      "- Keep implementationTemplate directly inside the returned object.",
      "- Keep its five existing nested keys directly inside that object literal.",
      "- Do not create a local variable named implementationTemplate.",
      "- Do not use ...implementationTemplate or any other spread to rebuild the return value.",
      "- Do not relocate, rename, flatten, or re-nest existing properties.",
      "- Make only the smallest requested behavioral change outside the preserved contract structure."
    ].join("\n");
  }

  if (
    normalizedViolation.includes(
      "removed required nested return-contract properties"
    ) ||
    normalizedViolation.includes(
      "preserve the complete nested object contract"
    )
  ) {
    return [
      "Specific correction for nested return-contract preservation:",
      "- Preserve every existing nested property inside implementationTemplate.",
      "- Keep targetSymbol, symbolType, expectedBehavior, implementationTemplate, and executableCodeTemplate.",
      "- Keep implementationTemplate as a direct property of the returned object.",
      "- Keep its value as a direct object literal containing the same five nested keys.",
      "- Do not hoist implementationTemplate into a local variable.",
      "- Do not reconstruct the returned contract with object spread syntax.",
      "- Do not move top-level properties into implementationTemplate or move nested properties to the top level.",
      "- Do not replace implementationTemplate with an empty object.",
      "- Preserve null values where the existing nested contract uses null.",
      "- Preserve reason as an array and confidence as a string.",
      "- Copy currentTargetSource first, then make only the smallest concrete behavioral change."
    ].join("\n");
  }
  if (
    normalizedViolation.includes(
      "changed required top-level return-property types"
    ) ||
    normalizedViolation.includes(
      "preserve the existing return contract value shapes"
    )
  ) {
    return [
      "Specific correction for return-property type preservation:",
      "- Preserve the existing value type of every top-level returned property.",
      "- Keep strings as strings, arrays as arrays, objects as objects, numbers as numbers, booleans as booleans, and null only where the existing contract uses null.",
      "- Do not replace implementationTemplate objects with null.",
      "- Do not replace reason arrays with strings.",
      "- Do not replace confidence strings with numeric scores.",
      "- Start from currentTargetSource and make the smallest concrete change."
    ].join("\n");
  }

  if (
    normalizedViolation.includes(
      "removed required return-object properties"
    )
  ) {
    return [
      "Specific correction for return-contract preservation:",
      "- Start from currentTargetSource.",
      "- Preserve every existing top-level property in the returned object.",
      "- Do not move required properties into planningMetadata, context, metadata, or another nested object.",
      "- Add or change only behavior required by the task.",
      "- Return the complete replacement function."
    ].join("\n");
  }

  if (
    normalizedViolation.includes(
      "does not expose a detectable top-level return-object contract"
    )
  ) {
    return [
      "Specific correction for the return-object contract:",
      "- The replacement function must retain its top-level return { ... } object.",
      "- Return the complete named function declaration.",
      "- Preserve the existing top-level returned properties.",
      requiredReturnProperties.length > 0
        ? `- Required top-level returned properties: ${requiredReturnProperties.join(", ")}.`
        : "",
      "- Do not replace the result with a helper call, metadata wrapper, or generated-code string."
    ].join("\n");
  }

  if (
    normalizedViolation.includes(
      "complete-function output shape"
    ) ||
    normalizedViolation.includes(
      "complete named function declaration"
    )
  ) {
    return [
      "Specific correction for complete-function output:",
      "- Return exactly one complete JavaScript function declaration.",
      "- Use the exact requested target function name.",
      "- Include the opening and closing braces.",
      "- Do not return only statements, an object literal, prose, or Markdown."
    ].join("\n");
  }

  if (
    normalizedViolation.includes(
      "only comments"
    )
  ) {
    return [
      "Specific correction for executable behavior:",
      "- Return executable JavaScript, not comments.",
      "- Implement the requested behavior concretely.",
      "- Do not include TODO, pseudocode, placeholder comments, or an empty function."
    ].join("\n");
  }

  if (
    normalizedViolation.includes(
      "redeclares existing"
    )
  ) {
    return [
      "Specific correction for local declaration reuse:",
      "- Do not redeclare identifiers already present in currentTargetSource.",
      "- Reuse existing local declarations when appropriate.",
      "- Introduce a new identifier only when genuinely necessary and use a unique name.",
      localInsertOperation
        ? "- The requested operation is a local insert. Do not return or redeclare the complete target function."
        : "",
      localInsertOperation
        ? "- Return only the smallest executable augmentation valid at the requested insertion point."
        : "",
      statementsOnlyOutput
        ? "- The required output shape is statements-only. Do not return a function declaration, class declaration, or replacement symbol."
        : "",
      localInsertOperation && statementsOnlyOutput
        ? "- Prefer direct statements that use verified existing identifiers. Do not create a wrapper or duplicate the target declaration."
        : ""
    ].join("\n");
  }

  if (
    normalizedViolation.includes(
      "required existing invented-runtime safety indicators"
    ) ||
    normalizedViolation.includes(
      "null-or-human-readable-string return contract"
    ) ||
    normalizedViolation.includes(
      "required verified provider input references"
    ) ||
    normalizedViolation.includes(
      "invented provider-context function parameters"
    )
  ) {
    return [
      "Specific correction for invented dependency validator contract:",
      "- Start from currentTargetSource and preserve the existing function structure.",
      "- Return exactly the complete findInventedRuntimeDependencyViolation function.",
      "- Keep exactly the existing function arguments: input and executableCodeTemplate.",
      "- Do not add completeTargetSource, currentTargetSource, or existingLocalDeclarations as function parameters.",
      "- Read verified module source through input?.completeTargetSource.",
      "- Read verified target-function source through input?.currentTargetSource.",
      "- Read verified existing locals through input?.existingLocalDeclarations.",
      "- Preserve all eight existing invented-runtime safety indicators and their current detection behavior.",
      "- Copy the existing indicators block from currentTargetSource unchanged before adding new unresolved-identifier validation.",
      "- Preserve these exact existing indicator names and regex semantics:",
      "- assumed-runtime-helper => /assumed to be available in (?:the )?runtime context/i",
      "- delegation-stub => /stub representing (?:the )?delegation/i",
      "- placeholder-resolution-logic => /placeholder for actual (?:resolution )?logic/i",
      "- synthetic-provider-result => /Implementation generated for \\\$\\\{/i",
      "- invented-provider-helper => /function\\s+generateImplementationFromProvider\\s*\\(/i",
      "- invented-symbol-resolver => /function\\s+resolveConcreteSymbol\\s*\\(/i",
      "- invented-symbol-describer => /function\\s+describeSymbol\\s*\\(/i",
      "- invented-validator-requirements-helper => /function\\s+getPatchValidatorRequirements\\s*\\(/i",
      "- Do not rename, paraphrase, simplify, replace, or reinterpret any of those eight existing regex patterns.",
      "- Preserve the existing any-match semantics: one matched existing indicator is sufficient to return a violation.",
      "- Preserve the existing return contract: return null when no violation exists; otherwise return a human-readable violation string.",
      "- Never return an object such as { score, indicators }.",
      "- Extend the existing validator narrowly to detect unresolved executable identifiers using verified repository evidence.",
      "- Do not invent helpers, providers, parsers, imports, runtime APIs, or new architectural layers.",
      "- Preserve valid identifiers that are already declared in the target function, generated function, or target module.",
      "- Ignore identifiers that occur only inside comments or ordinary string text.",
      "- Preserve executable identifiers inside template-literal interpolation expressions.",
      "- For member access, validate the base identifier and do not treat the property after a dot as a separate dependency.",
      "- Return production JavaScript only, with the exact existing target function name."
    ].join("\n");
  }

  if (
    normalizedViolation.includes(
      "invented runtime dependencies"
    ) ||
    normalizedViolation.includes(
      "stub helper behavior"
    )
  ) {
    return [
      "Specific correction for invented runtime dependencies:",
      "- Do not invent helper functions, runtime APIs, providers, resolvers, validators, or imports.",
      "- Use only identifiers already present in currentTargetSource or explicitly supplied by the task.",
      "- Do not write comments claiming helpers are assumed to exist.",
      "- Do not include stubs, placeholder logic, simulated delegation, or synthetic implementation strings.",
      "- Preserve the existing function structure and make only a concrete, locally valid change."
    ].join("\n");
  }

  if (
    normalizedViolation.includes(
      "illustrative example"
    ) ||
    normalizedViolation.includes(
      "placeholder"
    )
  ) {
    return [
      "Specific correction for illustrative or placeholder output:",
      "- Return production implementation code.",
      "- Do not return examples, samples, demonstrations, schemas, placeholders, or generic templates.",
      "- Use the actual target symbol and current source.",
      "- Preserve the existing function contract."
    ].join("\n");
  }

  return [
    "General correction:",
    "- Fix the stated violation directly.",
    "- Use currentTargetSource as the implementation baseline.",
    "- Return the actual complete replacement code, not an explanation or code-generation template.",
    "- Preserve all existing behavior and contract elements not explicitly changed by the task."
  ].join("\n");
}

function buildImmediateRetryPrompt({
  input = null,
  violation = "",
  rejectedCode = ""
} = {}) {
  const requiredOutputShapeConstraints =
    buildRequiredOutputShapeConstraints(
      input
    );

  return [
    "Your previous executableCodeTemplate violated the required contract.",
    "",
    `Violation: ${violation}`,
    buildViolationCorrectionGuidance(
      violation,
      input
    ),
    "",
    "",
    "Rejected executableCodeTemplate:",
    rejectedCode || "(empty)",
    "",
    input?.developmentPrinciples
      ? "Preserve all supplied development principles during correction, including verified-target editing, existing-runtime-first integration, duplicate-runtime avoidance, reuse-before-creation, autonomy-over-runtime-count, direct execution-path verification, and summarized large verification output."
      : "",
    "",
    "Regenerate the JSON result now.",
    requiredOutputShapeConstraints,
    "",
    "Do not return comments without executable code.",
    "Preserve the requested JSON schema exactly."
  ].join("\n");
}

function buildRetryEvidenceRegressionClient() {
  const rejectedImplementations = [
    '"assumed to be available in runtime context"; const attemptZero = 0;',
    '"assumed to be available in runtime context"; const attemptOne = 1;',
    '"assumed to be available in runtime context"; const attemptTwo = 2;',
    '"assumed to be available in runtime context"; const attemptThree = 3;'
  ];

  let completionIndex = 0;

  return {
    chat: {
      completions: {
        create: async () => {
          const index = completionIndex;
          completionIndex += 1;

          return {
            _request_id:
              `retry-regression-${index}`,
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    executableCodeTemplate:
                      rejectedImplementations[index] ||
                      rejectedImplementations.at(-1),
                    summary:
                      `Injected retry regression response ${index}.`
                  })
                }
              }
            ]
          };
        }
      }
    }
  };
}

function runEnforcementContractSelfCheck() {
  const completeTargetSource = [
    "function safeString(value) {",
    '  return typeof value === "string" ? value.trim() : "";',
    "}",
    findInventedRuntimeDependencyViolation.toString()
  ].join("\n");
  const validContract =
    findInventedRuntimeDependencyViolation.toString();
  const input = {
    completeTargetSource,
    currentTargetSource: [
      "function findInventedRuntimeDependencyViolation({",
      "  input = null,",
      '  executableCodeTemplate = ""',
      "} = {}) {",
      "  return null;",
      "}"
    ].join("\n"),
    existingLocalDeclarations: [],
    requiredOutputShape: "complete-function",
    targetSymbol:
      "findInventedRuntimeDependencyViolation"
  };
  const normalized = normalizeProviderInput({
    completeTargetSource:
      "  function verifiedModuleTarget() {}  ",
    surroundingContext: {
      text: "verified context"
    }
  });

  const accepted = findImmediateGenerationViolation({
    input,
    executableCodeTemplate: validContract
  });
  const missingIndicator = findImmediateGenerationViolation({
    input,
    executableCodeTemplate: validContract.replace(
      '"assumed-runtime-helper"',
      '"removed-runtime-helper"'
    )
  });
  const inventedParameters = findImmediateGenerationViolation({
    input,
    executableCodeTemplate: validContract.replace(
      "  input = null,",
      '  input = null, completeTargetSource = "",'
    )
  });
  const missingVerifiedInput = findImmediateGenerationViolation({
    input,
    executableCodeTemplate: validContract.replaceAll(
      "input?.completeTargetSource",
      "input?.moduleSource"
    )
  });
  const parameterContractSource = [
    "function target() {",
    "  return {",
    "    generate: function(context) {",
    "      const targetSymbol = context.resolveTargetSymbol();",
    "      const provider = context.getImplementationProvider();",
    "      return context.validatePatch(provider.generateImplementation(targetSymbol));",
    "    }",
    "  };",
    "}"
  ].join("\n");
  const inventedParameterMembers = findImmediateGenerationViolation({
    input: {
      completeTargetSource: parameterContractSource,
      currentTargetSource: parameterContractSource,
      existingLocalDeclarations: ["targetSymbol", "provider"],
      requiredOutputShape: "complete-function",
      targetSymbol: "target"
    },
    executableCodeTemplate: [
      "function target() {",
      "  return {",
      "    generate: function(context) {",
      '      const targetSymbol = context.resolveSymbol("target");',
      "      const implementation = context.providers.generateImplementation(targetSymbol);",
      "      context.validators.patchValidator(implementation);",
      "      return implementation;",
      "    }",
      "  };",
      "}"
    ].join("\n")
  });
  const throwOnlyStub = findImmediateGenerationViolation({
    input: {
      completeTargetSource: parameterContractSource,
      currentTargetSource: parameterContractSource,
      existingLocalDeclarations: ["targetSymbol", "provider"],
      requiredOutputShape: "complete-function",
      targetSymbol: "target"
    },
    executableCodeTemplate: [
      "function target() {",
      "  return {",
      "    generate: function(context) {",
      '      throw new Error("generate is not implemented in this runtime.");',
      "    }",
      "  };",
      "}"
    ].join("\n")
  });
  const functionPropertyContractSource = [
    "function target() {",
    "  return {",
    "    generateExecutableImplementation: function(context) {",
    "      return context.resolveTargetSymbol();",
    "    }",
    "  };",
    "}"
  ].join("\n");
  const functionPropertyTypeLoss = findImmediateGenerationViolation({
    input: {
      completeTargetSource: functionPropertyContractSource,
      currentTargetSource: functionPropertyContractSource,
      existingLocalDeclarations: [],
      requiredOutputShape: "complete-function",
      targetSymbol: "target"
    },
    executableCodeTemplate: [
      "function target() {",
      "  return {",
      "    generateExecutableImplementation: true",
      "  };",
      "}"
    ].join("\n")
  });
  const functionPropertySignatureChange = findImmediateGenerationViolation({
    input: {
      completeTargetSource: functionPropertyContractSource,
      currentTargetSource: functionPropertyContractSource,
      existingLocalDeclarations: [],
      requiredOutputShape: "complete-function",
      targetSymbol: "target"
    },
    executableCodeTemplate: [
      "function target() {",
      "  return {",
      "    generateExecutableImplementation: function(provider) {",
      "      return provider();",
      "    }",
      "  };",
      "}"
    ].join("\n")
  });
  const guidance = buildViolationCorrectionGuidance(
    "The generated invented-runtime dependency validator did not use required verified provider input references.",
    input
  );

  return {
    mode:
      "openai-provider-enforcement-contract-self-check",
    success:
      normalized.completeTargetSource ===
        "function verifiedModuleTarget() {}" &&
      accepted === null &&
      typeof missingIndicator === "string" &&
      missingIndicator.includes("removed") &&
      typeof inventedParameters === "string" &&
      inventedParameters.includes("function parameters") &&
      typeof missingVerifiedInput === "string" &&
      missingVerifiedInput.includes("verified provider input") &&
      typeof inventedParameterMembers === "string" &&
      inventedParameterMembers.includes("context.resolveSymbol") &&
      inventedParameterMembers.includes("context.providers") &&
      inventedParameterMembers.includes("context.validators") &&
      typeof throwOnlyStub === "string" &&
      throwOnlyStub.includes("throw-only-unimplemented-stub") &&
      typeof functionPropertyTypeLoss === "string" &&
      functionPropertyTypeLoss.includes("expected function") &&
      typeof functionPropertySignatureChange === "string" &&
      functionPropertySignatureChange.includes("parameter contract") &&
      guidance.includes("input and executableCodeTemplate") &&
      guidance.includes("input?.completeTargetSource") &&
      guidance.includes("all eight existing invented-runtime safety indicators"),
    normalizedCompleteTargetSourcePreserved:
      normalized.completeTargetSource ===
      "function verifiedModuleTarget() {}",
    generationGuardAcceptedValidContract:
      accepted === null,
    generationGuardRejectedMissingIndicators:
      typeof missingIndicator === "string" &&
      missingIndicator.includes("removed"),
    generationGuardRejectedInventedParameters:
      typeof inventedParameters === "string" &&
      inventedParameters.includes("function parameters"),
    generationGuardRejectedMissingVerifiedInput:
      typeof missingVerifiedInput === "string" &&
      missingVerifiedInput.includes("verified provider input"),
    generationGuardRejectedInventedParameterMembers:
      typeof inventedParameterMembers === "string" &&
      inventedParameterMembers.includes("context.resolveSymbol") &&
      inventedParameterMembers.includes("context.providers") &&
      inventedParameterMembers.includes("context.validators"),
    generationGuardRejectedThrowOnlyStub:
      typeof throwOnlyStub === "string" &&
      throwOnlyStub.includes("throw-only-unimplemented-stub"),
    generationGuardRejectedFunctionPropertyTypeLoss:
      typeof functionPropertyTypeLoss === "string" &&
      functionPropertyTypeLoss.includes("expected function"),
    generationGuardRejectedFunctionPropertySignatureChange:
      typeof functionPropertySignatureChange === "string" &&
      functionPropertySignatureChange.includes("parameter contract"),
    correctionGuidancePreservesExistingArguments:
      guidance.includes("input and executableCodeTemplate"),
    correctionGuidanceRequiresVerifiedInput:
      guidance.includes("input?.completeTargetSource") &&
      guidance.includes("input?.currentTargetSource") &&
      guidance.includes("input?.existingLocalDeclarations"),
    correctionGuidanceRequiresIndicators:
      guidance.includes("all eight existing invented-runtime safety indicators")
  };
}

async function main({
  clientOverride = null,
  apiKeyOverride = null,
  skipEnvironmentFile = false
} = {}) {
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

  const envResult = skipEnvironmentFile
    ? { error: null }
    : dotenv.config({
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
    safeString(apiKeyOverride) ||
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

  const semanticSmokeViolation =
    runInventedRuntimeDependencySemanticSmoke();

  if (semanticSmokeViolation) {
    fail(
      "Invented-runtime dependency semantic validator self-check failed.",
      {
        semanticSmokeViolation
      }
    );
    return;
  }

  const client =
    clientOverride ||
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

    let executableCodeTemplate =
      safeString(
        parsed.executableCodeTemplate
      );

    let finalParsed =
      parsed;

    let finalCompletion =
      completion;

    let generationViolation =
      findImmediateGenerationViolation({
        input:
          providerInput,
        executableCodeTemplate
      });

    const immediateRetryLimit =
      3;

    let immediateRetryCount =
      0;

    let previousResponseText =
      responseText;

    const retryDiagnostics = [
      {
        attempt:
          0,
        violation:
          generationViolation,
        executableCodeTemplate
      }
    ];
    while (
      generationViolation &&
      immediateRetryCount <
        immediateRetryLimit
    ) {
      immediateRetryCount += 1;

      const retryCompletion =
        await client.chat.completions.create({
          model,
          temperature: 0,
          response_format: {
            type: "json_schema",
            json_schema: {
              name:
                "ash_implementation_result",
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
                additionalProperties:
                  false
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
                buildUserPrompt(
                  providerInput
                )
            },
            {
              role: "assistant",
              content:
                previousResponseText
            },
            {
              role: "user",
              content:
                buildImmediateRetryPrompt({
                  input:
                    providerInput,
                  violation:
                    generationViolation,
                  rejectedCode:
                    executableCodeTemplate
                }) +
                `\n\nCorrection attempt ${immediateRetryCount} of ${immediateRetryLimit}.`
            }
          ]
        });

      const retryResponseText =
        retryCompletion
          .choices?.[0]?.message
          ?.content ?? "";

      const retryParsed =
        extractJsonObject(
          retryResponseText
        );

      const retryExecutableCodeTemplate =
        safeString(
          retryParsed
            .executableCodeTemplate
        );

      const retryViolation =
        findImmediateGenerationViolation({
          input:
            providerInput,
          executableCodeTemplate:
            retryExecutableCodeTemplate
        });

      retryDiagnostics.push({
        attempt:
          immediateRetryCount,
        violation:
          retryViolation ||
          (
            retryExecutableCodeTemplate
              ? null
              : "OpenAI did not return executable code."
          ),
        executableCodeTemplate:
          retryExecutableCodeTemplate
      });
      previousResponseText =
        retryResponseText;

      executableCodeTemplate =
        retryExecutableCodeTemplate;

      finalParsed =
        retryParsed;

      finalCompletion =
        retryCompletion;

      generationViolation =
        retryViolation ||
        (
          retryExecutableCodeTemplate
            ? null
            : "OpenAI did not return executable code."
        );
    }

    if (generationViolation) {
      const normalizedRetryDiagnostics =
        retryDiagnostics
          .filter(
            (diagnostic) =>
              diagnostic &&
              typeof diagnostic.violation ===
                "string" &&
              diagnostic.violation.trim()
          )
          .map(
            (diagnostic) => ({
              attempt:
                diagnostic.attempt,
              violation:
                diagnostic.violation.trim(),
              executableCodeTemplate:
                safeString(
                  diagnostic.executableCodeTemplate
                )
            })
          );

      const violationCounts =
        new Map();

      for (
        const diagnostic
        of normalizedRetryDiagnostics
      ) {
        violationCounts.set(
          diagnostic.violation,
          (
            violationCounts.get(
              diagnostic.violation
            ) || 0
          ) + 1
        );
      }

      const repeatedViolationEntry =
        [...violationCounts.entries()]
          .find(
            ([, count]) =>
              count >= 2
          ) ||
        null;

      const repeatedViolation =
        repeatedViolationEntry?.[0] ||
        null;

      const repeatedViolationDiagnostics =
        repeatedViolation
          ? normalizedRetryDiagnostics.filter(
              (diagnostic) =>
                diagnostic.violation ===
                  repeatedViolation
            )
          : [];

      const distinctRejectedImplementations =
        new Set(
          repeatedViolationDiagnostics
            .map(
              (diagnostic) =>
                diagnostic
                  .executableCodeTemplate
            )
            .filter(Boolean)
        );

      const repeatedGenerationViolation =
        repeatedViolation
          ? {
              detected:
                true,
              violation:
                repeatedViolation,
              occurrenceCount:
                repeatedViolationDiagnostics.length,
              attempts:
                repeatedViolationDiagnostics.map(
                  (diagnostic) =>
                    diagnostic.attempt
                ),
              distinctRejectedImplementationCount:
                distinctRejectedImplementations.size,
              generatedImplementationsChanged:
                distinctRejectedImplementations.size >
                  1,
              suspectedValidationOrGuidanceDefect:
                repeatedViolationDiagnostics.length >=
                  2 &&
                distinctRejectedImplementations.size >
                  1,
              reason:
                repeatedViolationDiagnostics.length >=
                  2 &&
                distinctRejectedImplementations.size >
                  1
                  ? (
                      "The same generation violation persisted across " +
                      "multiple distinct generated implementations. " +
                      "Inspect validator semantics and retry guidance " +
                      "before assuming another generation retry is useful."
                    )
                  : (
                      "The same generation violation repeated, but the " +
                      "rejected implementation did not materially change."
                    )
            }
          : {
              detected:
                false,
              violation:
                null,
              occurrenceCount:
                0,
              attempts:
                [],
              distinctRejectedImplementationCount:
                0,
              generatedImplementationsChanged:
                false,
              suspectedValidationOrGuidanceDefect:
                false,
              reason:
                null
            };

      fail(
        "OpenAI implementation regeneration did not satisfy the function-body contract.",
        {
          model,
          retryAttempts:
            immediateRetryCount,
          retryLimit:
            immediateRetryLimit,
          retryViolation:
            generationViolation,
          repeatedGenerationViolation,
          rejectedExecutableCodeTemplate:
            executableCodeTemplate || null,
          rejectedExecutableCodeLength:
            executableCodeTemplate.length,
          retryDiagnostics,
          requestId:
            finalCompletion
              ._request_id || null
        }
      );
      return;
    }

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
        safeString(
          finalParsed.summary
        ),
      requestId:
        finalCompletion
          ._request_id || null
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

if (
  process.argv.includes(
    "--enforcement-contract-self-check"
  )
) {
  const result =
    runEnforcementContractSelfCheck();

  writeResult(result);

  if (!result.success) {
    process.exitCode = 1;
  }
} else if (
  process.argv.includes(
    "--retry-evidence-integration-self-check"
  )
) {
  main({
    clientOverride:
      buildRetryEvidenceRegressionClient(),
    apiKeyOverride:
      "ash-regression-not-a-real-api-key",
    skipEnvironmentFile:
      true
  }).catch((error) => {
    fail(
      "Unexpected Ash retry-evidence regression failure.",
      {
        errorMessage:
          error instanceof Error
            ? error.message
            : String(error)
      }
    );
    process.exitCode = 1;
  });
} else if (
  process.argv.includes(
    "--semantic-self-check"
  )
) {
  const semanticSmokeViolation =
    runInventedRuntimeDependencySemanticSmoke();

  const returnShapeSmokeViolation =
    runReturnContractShapeSemanticSmoke();

  writeResult({
    mode:
      "openai-implementation-provider-semantic-self-check",
    success:
      semanticSmokeViolation === null &&
      returnShapeSmokeViolation === null,
    semanticSmokeViolation,
    returnShapeSmokeViolation
  });

  if (
    semanticSmokeViolation ||
    returnShapeSmokeViolation
  ) {
    process.exitCode = 1;
  }
} else {
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
}
