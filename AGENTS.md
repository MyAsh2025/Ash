# Ash repository entry instructions

This file is an execution entry point for the existing Ash development contract. It does not replace or restate that contract.

## Canonical context

- Treat the Git root containing `ash-dev-verify.js` and `ash-auto-dev.js` as the canonical working directory.
- Before editing, inspect repository status and preserve unrelated existing changes.
- Before development work, read `ash/DEVELOPMENT-RULES.md` and follow it as the authoritative development and verification contract.
- If this entry point and the contract or its implementation appear inconsistent, stop and report the inconsistency instead of creating a parallel rule.
- When changing verification or enforcement, inspect the current `ash-dev-verify.js`, `ash/runtime/corecheck-runtime.js`, `ash/runtime/autonomous-development-manager.js`, and the relevant registered regression checks. Do not duplicate their check lists here; the implementation is the source of truth.

## Permanent regression path

For a newly discovered real defect, follow the completion sequence in `ash/DEVELOPMENT-RULES.md`. In particular:

1. Add or update a reproducible repository regression check and reproduce the defect with it.
2. Ensure the check is connected to CoreCheck through `runPermanentRegressionChecks()`; a standalone `*-regression-test.js` file is not a permanent gate unless that function executes it.
3. Repair the production implementation.
4. Run the same regression check directly and require it to pass.
5. Run the canonical CoreCheck and relevant autonomous dry-run gates below.

Do not create an alternative authoritative test list in this file.

## Canonical CoreCheck gate

After development changes, run `node ./ash-dev-verify.js` directly from the Git root. Do not substitute the generic `runtime_corecheck` or `run_corecheck` PowerShell executor path for this Ash repository gate.

Treat this gate as passing only when the process exits successfully and its result reports both development verification and CoreCheck success. Inspect and report dirty worktree state separately; preserve unrelated changes.

## Autonomous dry-run gate

After the relevant regression check and canonical CoreCheck pass, run the relevant Ash autonomous development flow from the real Git root in explicit dry-run mode, normally `node ./ash-auto-dev.js --task "<the actual development task>" --dry-run --cycles 1`.

Require a successful process result and verify from its output that no patch was applied. Do not treat an unrelated report-only route, repository-inventory route, or `no_repository_task` result as evidence that the relevant development flow passed. Do not substitute `npm run dry` unless the authoritative contract and current implementation establish it as the relevant path.

When the production repair is already present, the canonical alternative is the formal existing-repair verification route exposed by `ash-auto-dev.js`. Use explicit target-file, target-symbol, and permanent-regression identifiers. Treat it as passing only when repository-derived eligibility is true, the registered coverage matches the changed target, the matching regression passes, CoreCheck passes, and the result reports existing-repair completion success with no patch applied. Never use this route as a fallback within a failed patch-generation run, and never treat a safety rejection alone as completion evidence.

## Direct execution before user handoff

Use safe editing and verification paths available in this environment directly. Before asking the user to run PowerShell, execute a command, perform a partial edit, or manually verify a result:

1. Attempt the safe in-scope operation directly when the environment permits it.
2. Try the repository's canonical entry points and registered checks before inventing another path.
3. If execution is blocked by permissions, unavailable external state, or a required user decision, report the attempted path and concrete blocker before requesting user action.

Using PowerShell as the current shell is allowed. Do not create a temporary PowerShell script or disposable probe as an authoritative pass/fail gate. Temporary instrumentation may only observe unknown structure and must not replace the permanent repository regression path.

## Approval policy

Treat ordinary safe, in-scope operations as normal development work when repository state, the current task, this entry contract, and available verification make their safety clear. This includes normal reading, inspection, tests, verification, dry-runs, temporary network access, edits to confirmed target files, staging, and a sufficiently verified checkpoint commit. Do not return a routine safety decision to the user merely by asking whether to proceed. If a tool UI requires one-time system approval for a non-destructive, reversible, non-publishing operation, use that required UI without adding a separate procedural user decision.

Stop before operations that could discard existing changes or are destructive, irreversible, or based on an unverified overwrite. Require explicit user confirmation before actions such as `git reset --hard`, broad `git restore`, bulk deletion, history rewriting, or a forced overwrite that has not been verified safe.

Require explicit user confirmation before publishing or materially changing external state, including `git push`, release, public publication, or another consequential external change.

Do not proceed automatically with an unexpected large change. If its targets, scale, or reason cannot be justified by the current task and this development contract, stop and ask the user for direction.

Never bypass, suppress, or disable an approval UI that Codex or an underlying tool requires at the system level. Use the required approval UI as presented.

## Completion gate

Do not claim a real defect is complete, and do not commit or release, unless every gate required by `ash/DEVELOPMENT-RULES.md` has passed. Report the permanent regression check used, canonical CoreCheck result, relevant autonomous dry-run result, and any remaining unverified condition.

For a checkpoint that changes architecture, dependencies, environment requirements, Controller or Task Scheduler behavior, startup/shutdown, runtime evidence ownership, or migration/recovery procedure, explicitly assess whether `ASH-MIGRATION-MASTER.md` must be updated. When migration or recovery behavior changes, update that canonical migration document in the same checkpoint.
