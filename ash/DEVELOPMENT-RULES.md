# Ash Development Verification Contract

These rules are part of the repository development contract, not temporary chat guidance.

## Permanent verification

- A newly discovered real defect must receive a reproducible repository regression check.
- A defect is not complete when production code alone is fixed. Completion requires the regression check to pass and CoreCheck to pass.
- Permanent regression checks are executed by CoreCheck through `runPermanentRegressionChecks()`.
- The saved entry point for normal development verification is `node ./ash-dev-verify.js`.
- Verification code is itself subject to `node --check` and CoreCheck.

## No parallel disposable audit path

- Do not use a disposable PowerShell script or temporary probe as the authoritative pass/fail gate for Ash development.
- Temporary instrumentation may be used only to observe an unknown structure. Any behavior relied on for future correctness must be converted into a repository regression check.
- Do not execute copied runtime modules from a different directory when their relative imports depend on repository location.
- Do not inject probe exports before a later `module.exports = ...` assignment that can overwrite them.
- Do not use large formatting-sensitive exact-text replacements as the normal edit strategy for production source.

## Failure evidence and autonomous repair

- Provider failure evidence must survive the complete route from implementation provider result to autonomous repair task.
- This includes retry attempts, retry limit, retry violation, retry diagnostics, repeated-generation diagnosis, rejected implementation evidence, and request ID when supplied by the provider.
- Repeated equivalent violations across distinct generated implementations are evidence that validation or generation guidance may be defective. Ash must preserve that evidence for repair instead of blindly regenerating indefinitely.
- Debugging must remain possible without weakening safety gates. A safety or validation defect is itself a valid repair target.

## Required completion sequence

For a real development defect, use this sequence:

1. Reproduce it with a permanent repository regression check.
2. Repair the production implementation.
3. Run the same regression check and require it to pass.
4. Run `node ./ash-dev-verify.js` and require CoreCheck to pass.
5. Produce relevant autonomous completion evidence in the real repository context:
   - For work that still requires a new patch candidate, run the patch-generation dry-run and require the development pipeline, patch validation, dry-run apply, and CoreCheck to succeed with no patch applied.
   - For a production repair that is already present in the repository change set, use the formal existing-repair verification route. Eligibility must be established mechanically from the changed target file and symbol plus matching coverage from a registered permanent regression check. The matching regression and CoreCheck must pass in the same verification run.
6. Do not commit or release when any required gate fails.

## Completion evidence integrity

- Patch-generation completion and existing-repair verification completion are distinct evidence kinds.
- Existing-repair verification eligibility must come only from repository change evidence and formally registered permanent regression coverage. Task wording, an implementation provider, or model judgment must not grant eligibility.
- Existing-repair verification must not be selected as a fallback after a patch-generation failure or safety rejection in the same run.
- A safety rejection proves that the safety gate evaluated and rejected a candidate. It does not by itself prove development completion.
- Report-only, repository-inventory, CoreCheck-only, and `no_repository_task` routes are not existing-repair completion evidence.
- When a new patch candidate can be generated and verified, the autonomous patch-generation dry-run remains required.
