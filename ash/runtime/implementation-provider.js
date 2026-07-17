"use strict";

function normalizeTemplate(value = null) {
  if (!value || typeof value !== "object") {
    return {
      targetSymbol: null,
      symbolType: null,
      expectedBehavior: [],
      executableCodeTemplate: null
    };
  }

  return {
    ...value,
    targetSymbol:
      value.targetSymbol || null,
    symbolType:
      value.symbolType || null,
    expectedBehavior:
      Array.isArray(value.expectedBehavior)
        ? value.expectedBehavior
            .filter(
              (item) =>
                typeof item === "string" &&
                item.trim().length > 0
            )
            .map((item) => item.trim())
        : [],
    executableCodeTemplate:
      typeof value.executableCodeTemplate === "string"
        ? value.executableCodeTemplate.trim()
        : null
  };
}

function normalizeProviderResult(value = null) {
  if (typeof value === "string") {
    return {
      success: value.trim().length > 0,
      executableCodeTemplate:
        value.trim() || null,
      providerName: "external-provider"
    };
  }

  if (!value || typeof value !== "object") {
    return {
      success: false,
      executableCodeTemplate: null,
      providerName: null,
      reason:
        "Implementation provider returned no result."
    };
  }

  const executableCodeTemplate =
    typeof value.executableCodeTemplate === "string"
      ? value.executableCodeTemplate.trim()
      : "";

  return {
    ...value,
    success:
      value.success !== false &&
      executableCodeTemplate.length > 0,
    executableCodeTemplate:
      executableCodeTemplate || null,
    providerName:
      value.providerName ||
      value.provider ||
      "external-provider"
  };
}

function buildProviderInput({
  implementationPlanner = null,
  targetLocator = null
} = {}) {
  return {
    task:
      implementationPlanner?.task || null,
    targetFile:
      implementationPlanner?.targetFile ||
      targetLocator?.repositoryTargetFile ||
      null,
    targetSymbol:
      implementationPlanner?.targetSymbol ||
      targetLocator?.targetSymbol ||
      null,
    symbolType:
      implementationPlanner?.symbolType ||
      targetLocator?.symbolType ||
      null,
    expectedBehavior:
      Array.isArray(
        implementationPlanner?.expectedBehavior
      )
        ? implementationPlanner.expectedBehavior
        : [],
    implementationType:
      implementationPlanner?.implementationType ||
      null,
    strategy:
      implementationPlanner?.strategy || null,
    recommendedOperation:
      implementationPlanner?.recommendedOperation ||
      null,
    surroundingContext:
      targetLocator?.surroundingContext || null
  };
}

function hydrateImplementationPlanner({
  implementationPlanner,
  executableCodeTemplate,
  providerName
} = {}) {
  const originalTemplate =
    normalizeTemplate(
      implementationPlanner?.implementationTemplate
    );

  const hydratedTemplate = {
    ...originalTemplate,
    targetSymbol:
      originalTemplate.targetSymbol ||
      implementationPlanner?.targetSymbol ||
      null,
    symbolType:
      originalTemplate.symbolType ||
      implementationPlanner?.symbolType ||
      null,
    expectedBehavior:
      originalTemplate.expectedBehavior.length > 0
        ? originalTemplate.expectedBehavior
        : Array.isArray(
            implementationPlanner?.expectedBehavior
          )
          ? implementationPlanner.expectedBehavior
          : [],
    executableCodeTemplate
  };

  const executableTemplateReady =
    typeof executableCodeTemplate === "string" &&
    executableCodeTemplate.trim().length > 0;

  return {
    ...implementationPlanner,
    implementationTemplate: hydratedTemplate,
    executableTemplateReady,
    readyForCodeGeneration:
      implementationPlanner?.concretePlanReady === true &&
      executableTemplateReady,
    implementationProvider:
      providerName || null
  };
}

function resolveImplementationProvider({
  implementationPlanner = null,
  targetLocator = null,
  provider = null
} = {}) {
  if (!implementationPlanner) {
    return {
      mode: "implementation-provider-runtime",
      version:
        "ash-local-runtime-v0.1-provider-boundary",
      success: false,
      providerConfigured:
        typeof provider === "function",
      implementationPlanner: null,
      providerInput: null,
      reason:
        "Implementation planner result is missing."
    };
  }

  const existingTemplate =
    normalizeTemplate(
      implementationPlanner.implementationTemplate
    );

  if (existingTemplate.executableCodeTemplate) {
    return {
      mode: "implementation-provider-runtime",
      version:
        "ash-local-runtime-v0.1-provider-boundary",
      success: true,
      providerConfigured:
        typeof provider === "function",
      providerName:
        implementationPlanner.implementationProvider ||
        "existing-template",
      providerInput:
        buildProviderInput({
          implementationPlanner,
          targetLocator
        }),
      implementationPlanner:
        hydrateImplementationPlanner({
          implementationPlanner,
          executableCodeTemplate:
            existingTemplate.executableCodeTemplate,
          providerName:
            implementationPlanner.implementationProvider ||
            "existing-template"
        }),
      reason:
        "Existing executable implementation template was preserved."
    };
  }

  const providerInput =
    buildProviderInput({
      implementationPlanner,
      targetLocator
    });

  if (!providerInput.targetFile) {
    return {
      mode: "implementation-provider-runtime",
      version:
        "ash-local-runtime-v0.1-provider-boundary",
      success: false,
      providerConfigured:
        typeof provider === "function",
      implementationPlanner,
      providerInput,
      reason:
        "Implementation provider requires a target file."
    };
  }

  if (!providerInput.targetSymbol) {
    return {
      mode: "implementation-provider-runtime",
      version:
        "ash-local-runtime-v0.1-provider-boundary",
      success: false,
      providerConfigured:
        typeof provider === "function",
      implementationPlanner,
      providerInput,
      reason:
        "Implementation provider requires a target symbol."
    };
  }

  if (!providerInput.surroundingContext?.text) {
    return {
      mode: "implementation-provider-runtime",
      version:
        "ash-local-runtime-v0.1-provider-boundary",
      success: false,
      providerConfigured:
        typeof provider === "function",
      implementationPlanner,
      providerInput,
      reason:
        "Implementation provider requires surrounding source context."
    };
  }

  if (typeof provider !== "function") {
    return {
      mode: "implementation-provider-runtime",
      version:
        "ash-local-runtime-v0.1-provider-boundary",
      success: false,
      providerConfigured: false,
      implementationPlanner,
      providerInput,
      reason:
        "No external implementation provider is configured."
    };
  }

  let rawProviderResult;

  try {
    rawProviderResult =
      provider(providerInput);
  } catch (error) {
    return {
      mode: "implementation-provider-runtime",
      version:
        "ash-local-runtime-v0.1-provider-boundary",
      success: false,
      providerConfigured: true,
      implementationPlanner,
      providerInput,
      reason:
        error?.message ||
        "External implementation provider failed."
    };
  }

  if (
    rawProviderResult &&
    typeof rawProviderResult.then === "function"
  ) {
    return {
      mode: "implementation-provider-runtime",
      version:
        "ash-local-runtime-v0.1-provider-boundary",
      success: false,
      providerConfigured: true,
      implementationPlanner,
      providerInput,
      reason:
        "Asynchronous implementation providers are not supported by the synchronous development pipeline."
    };
  }

  const providerResult =
    normalizeProviderResult(rawProviderResult);

  if (
    providerResult.success !== true ||
    !providerResult.executableCodeTemplate
  ) {
    return {
      mode: "implementation-provider-runtime",
      version:
        "ash-local-runtime-v0.1-provider-boundary",
      success: false,
      providerConfigured: true,
      providerName:
        providerResult.providerName || null,
      implementationPlanner,
      providerInput,
      providerResult,
      reason:
        providerResult.reason ||
        "Implementation provider did not produce executable code."
    };
  }

  return {
    mode: "implementation-provider-runtime",
    version:
      "ash-local-runtime-v0.1-provider-boundary",
    success: true,
    providerConfigured: true,
    providerName:
      providerResult.providerName,
    providerInput,
    providerResult,
    implementationPlanner:
      hydrateImplementationPlanner({
        implementationPlanner,
        executableCodeTemplate:
          providerResult.executableCodeTemplate,
        providerName:
          providerResult.providerName
      }),
    reason:
      "Executable implementation template was produced by the configured provider."
  };
}

module.exports = {
  resolveImplementationProvider,
  buildProviderInput,
  hydrateImplementationPlanner
};
