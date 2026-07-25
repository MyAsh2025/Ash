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
    "- Do not invent unrelated files, dependencies, or architectural layers.",
    "- Do not include a complete file unless the target requires it.",
    "- The code must be syntactically valid for the target file.",
    "- JSON string escaping must be valid."
  ].join("\n");
}

function buildUserPrompt(input) {
  return [
    `Task: ${input.task || "(not provided)"}`,
    `Target file: ${input.targetFile}`,
    `Target symbol: ${input.targetSymbol}`,
    `Symbol type: ${input.symbolType}`,
    `Strategy: ${input.strategy || "(not provided)"}`,
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
