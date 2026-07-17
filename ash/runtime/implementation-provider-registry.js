"use strict";

function normalizeProviderName(value = null) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return normalized || null;
}

function createVerificationProvider({
  executableCodeTemplate = null
} = {}) {
  return function verificationImplementationProvider(
    providerInput = {}
  ) {
    const code =
      typeof executableCodeTemplate === "string"
        ? executableCodeTemplate.trim()
        : "";

    if (!code) {
      return {
        success: false,
        providerName: "verification-provider",
        executableCodeTemplate: null,
        reason:
          "Verification provider is connected but no executable code template was supplied."
      };
    }

    return {
      success: true,
      providerName: "verification-provider",
      executableCodeTemplate: code,
      metadata: {
        targetFile:
          providerInput.targetFile || null,
        targetSymbol:
          providerInput.targetSymbol || null,
        surroundingContextAvailable:
          Boolean(
            providerInput.surroundingContext?.text
          )
      }
    };
  };
}

function resolveImplementationProviderFromContext({
  context = {},
  environment = process.env
} = {}) {
  if (
    typeof context.implementationProvider ===
    "function"
  ) {
    return {
      mode: "implementation-provider-registry",
      success: true,
      configured: true,
      providerName:
        context.implementationProviderName ||
        "context-provider",
      provider:
        context.implementationProvider,
      source: "context"
    };
  }

  const requestedProvider =
    normalizeProviderName(
      context.implementationProviderName ||
      environment.ASH_IMPLEMENTATION_PROVIDER
    );

  if (!requestedProvider) {
    return {
      mode: "implementation-provider-registry",
      success: true,
      configured: false,
      providerName: null,
      provider: null,
      source: null
    };
  }

  if (
    requestedProvider === "verification" ||
    requestedProvider === "mock"
  ) {
    return {
      mode: "implementation-provider-registry",
      success: true,
      configured: true,
      providerName: "verification-provider",
      provider:
        createVerificationProvider({
          executableCodeTemplate:
            context.verificationExecutableCodeTemplate ||
            environment
              .ASH_VERIFICATION_EXECUTABLE_CODE_TEMPLATE ||
            null
        }),
      source:
        context.implementationProviderName
          ? "context-name"
          : "environment"
    };
  }

  return {
    mode: "implementation-provider-registry",
    success: false,
    configured: false,
    providerName: requestedProvider,
    provider: null,
    source:
      context.implementationProviderName
        ? "context-name"
        : "environment",
    reason:
      `Unknown implementation provider: ${requestedProvider}`
  };
}

module.exports = {
  resolveImplementationProviderFromContext,
  createVerificationProvider,
  normalizeProviderName
};
