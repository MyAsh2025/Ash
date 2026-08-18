# Ash Migration and Recovery Master

This is the single canonical entry document for moving, restoring, and safely resuming development of Ash. It is an index and recovery procedure, not a replacement for the authoritative development rules in `AGENTS.md` and `ash/DEVELOPMENT-RULES.md`.

Last audited: 2026-08-18 (Asia/Tokyo)

## Overview

Ash is a local runtime that observes its repository, discovers concrete work, plans and generates bounded code changes, validates and applies them, runs CoreCheck, and preserves repair/completion evidence for later runs. Its self-development policy is evidence-first: it must not invent work merely to avoid `no_repository_task`, guess ambiguous targets, weaken safety gates, or count report-only activity as development completion.

Responsibility is divided as follows:

- Ash performs safe repository observation, task discovery, planning, generation, validation, apply, CoreCheck, rollback/repair, and evidence persistence within its implemented policy.
- Codex or a human reviews semantic meaning, supplies authority that the runtime cannot possess, manages migration and operating-system integration, and intervenes when structured evidence cannot resolve ambiguity safely.
- A human must explicitly approve publication or consequential external changes such as `git push`, release, public deployment, and Windows Task Scheduler changes.
- Destructive or irreversible operations, unverified overwrites, broad restore/reset, and unexpected large changes require explicit confirmation. Safety and preservation of existing work take priority over autonomous progress.

The authoritative approval policy is `AGENTS.md`. Never infer approval from this document.

## Repository

- Repository: `Ash` (`package.json` package name: `ash-local-runtime`)
- Canonical local path on the audited PC: `C:\Users\Owner\StudioProjects\Ash`
- Git remote: `https://github.com/MyAsh2025/Ash.git`
- Canonical branch: `master`
- Audit baseline HEAD: `13a6b9792f1ae892277836d909a68db782c9959b` (`Add cooperative controller shutdown`)
- Audit baseline `origin/master`: `850ccf67ad15cf084d2d327dc650932087563e2f`
- Baseline relation: `master` ahead 1, behind 0. The cooperative-stop checkpoint was local and unpushed when this document was created.

Clone on a fresh PC:

```powershell
cd C:\Users\Owner\StudioProjects
git clone https://github.com/MyAsh2025/Ash.git Ash
cd C:\Users\Owner\StudioProjects\Ash
git switch master
```

If the required checkpoint has not been pushed, recover it from a verified old-PC repository or backup before relying on GitHub alone. Never force-reset a repository that may contain unpreserved work.

Confirm branch, cleanliness, and synchronization:

```powershell
git status --short --branch
git rev-parse HEAD
git rev-parse origin/master
git rev-list --left-right --count origin/master...HEAD
git remote -v
```

Interpret the count as `behind ahead`. Fetching or pushing changes remote state/network state and must follow `AGENTS.md`.

## Required environment

Audited host:

- Windows 11 Pro, 64-bit
- Version `10.0.26200`, build `26200`
- Node.js `v24.11.1`: `C:\Program Files\nodejs\node.exe`
- npm `11.6.2`: `C:\Program Files\nodejs\npm.cmd`
- Git for Windows `2.51.1.windows.1`: `C:\Program Files\Git\cmd\git.exe`
- Windows PowerShell: `C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe`

`node`, `npm`, and `git` are normally invoked through `PATH`. The registered Scheduled Task deliberately uses the absolute Node path. No Node `engines` range is declared in `package.json`; a new Node version is acceptable only after `npm ci` and the full canonical verification pass.

VS Code is not required. Provider use requires network access and a valid OpenAI credential. Windows Task Scheduler is required only for logon auto-start, not for direct CLI operation.

## Dependency setup

`package.json` declares the direct runtime dependencies and npm scripts. `package-lock.json` pins the resolved dependency graph and is the reproducible installation authority. The audited direct dependencies are `dotenv` and `openai`.

On a clean clone use:

```powershell
npm ci
```

Use `npm install` only when intentionally changing dependency declarations/lock data. Do not copy `node_modules`; it is ignored and reproducible from the lock file.

The package scripts `npm run run` and `npm run dry` invoke `ash/index.js`; they do not replace the repository's canonical development gate or the formal autonomous-development CLI.

## Secrets and environment

Never store an API key, token, password, or other secret value in this file, Git, logs, handovers, or patches. `.env` is ignored by Git and must be recreated or transferred through an approved secret channel.

Provider configuration:

- `OPENAI_API_KEY`: required by the OpenAI implementation provider.
- `OPENAI_API_MODEL`: optional; current provider default is `gpt-4.1-mini`.
- `ASH_OPENAI_ENV_FILE`: optional absolute/relative override for the environment file. Default is repository-root `.env`.
- `ASH_IMPLEMENTATION_PROVIDER`: optional provider selection; normal CLI default is `command`.
- `ASH_IMPLEMENTATION_PROVIDER_COMMAND`: optional command-provider executable; normal CLI default is `node`.
- `ASH_IMPLEMENTATION_PROVIDER_ARGS_JSON`: optional JSON array of provider arguments; normal CLI default points to `./ash/providers/openai-implementation-provider.mjs`.
- `ASH_IMPLEMENTATION_PROVIDER_TIMEOUT_MS`: optional provider timeout; normal CLI passes `180000` ms.
- `ASH_IMPLEMENTATION_PROVIDER_MAX_BUFFER_BYTES`: optional command-provider buffer limit.
- `ASH_CORE_PATH`: optional Ash Core path override.

Internal/test lifecycle variables such as `ASH_AUTONOMOUS_LOCK_TOKEN`, `ASH_CONTROLLER_PROJECT_ROOT`, `ASH_CONTROLLER_AUTO_DEV_PATH`, and `ASH_CONTROLLER_MODULE_ONLY` are not migration credentials and should not be configured for ordinary operation.

The audited `.env` exists and defines only the names `OPENAI_API_KEY` and `OPENAI_API_MODEL`; their values were not read into this document. Safely confirm configuration without printing values:

```powershell
if (Test-Path .env) { 'env file present' }
if ($env:OPENAI_API_KEY) { 'process credential present' }
```

## Canonical development contract

Authority is intentionally layered:

1. `AGENTS.md` is the repository entry contract and approval policy.
2. `ash/DEVELOPMENT-RULES.md` is the authoritative development and verification contract.
3. `ash-dev-verify.js` is the canonical executable verification entry point.
4. `ash/runtime/corecheck-runtime.js` defines the actual CoreCheck file set, permanent regression registry, and Provider Boundary checks.
5. A `*-regression-test.js` file is permanent only when `runPermanentRegressionChecks()` executes its registered check.
6. `ash/runtime/completion-evidence.js` and the existing-repair route in `ash-auto-dev.js` mechanically establish completion eligibility from repository change evidence and registered coverage.

Do not duplicate or reinterpret the detailed rules here. For a real defect, follow the sequence in `ash/DEVELOPMENT-RULES.md`: reproduce with a permanent regression, repair production, rerun the regression, run canonical verification, and obtain the required autonomous completion evidence. Report-only, inventory, safety rejection, and `no_repository_task` are not completion evidence.

Canonical command:

```powershell
node .\ash-dev-verify.js
```

It passes only when development verification and CoreCheck succeed. CoreCheck includes all registered permanent regressions and the Provider Boundary.

## Autonomous development architecture

The formal path is:

```text
repository observation
  -> task discovery
  -> target resolution
  -> implementation planning
  -> implementation provider
  -> patch generation
  -> patch validation
  -> apply
  -> CoreCheck
  -> rollback or repair when required
  -> runtime evidence
  -> completion
  -> next task or no_repository_task
```

Principal implementations include `repository-observation-runtime.js`, `task-discovery-runtime.js`, `autonomous-development-manager.js`, `target-locator.js`, `implementation-planner.js`, `implementation-provider.js`, `development-pipeline-runtime.js`, `patch-validator.js`, `patch-apply-engine.js`, and `runtime-state.js`.

Important safety stops include:

- unresolved or ambiguous target symbols are not guessed;
- verified runtime evidence requires a concrete existing target file and verified symbol;
- safety rejection alone is not converted into a request to weaken validation;
- Provider output is checked at the Provider Boundary and again by patch validation;
- destructive replacement and contract loss are rejected;
- dirty repositories and live repository locks block Controller apply startup;
- run result identity must match the current `controllerRunId` and child exit status;
- approval-required and safety-block outcomes stop automatic Controller retry;
- CoreCheck failure after apply invokes the existing verified-backup rollback path;
- report-only and cleanup findings are kept separate from development completion.

Formal apply entry:

```powershell
node .\ash-auto-dev.js --cycles 1 --apply
```

Formal dry run:

```powershell
node .\ash-auto-dev.js --cycles 1 --dry-run
```

Do not invent task text merely to obtain a successful run.

## Runtime evidence and restart

Canonical state path:

```text
ash/runtime-state/latest-runtime.json
```

The directory is Git-ignored. `runtime-state.js` owns normal runtime state plus `autonomousDevelopment.completedTasks` and `autonomousDevelopment.runtimeEvidence`. Normal state writes preserve autonomous evidence. Malformed existing state is not silently replaced.

Evidence concepts:

- `terminal-failure`: unresolved structured failure evidence associated with a concrete verified target.
- `successful-apply`: recorded only for real apply plus pipeline success, CoreCheck success, and matching active completion identity. Dry-run and `applied:false` do not resolve a failure.
- `formal-completion`: written by successful formal existing-repair verification.
- `verified-resolution`: an exact terminal failure signature and failure stage resolved by a successful formal existing-repair completion whose canonical CoreCheck passed both the failed check identity and the repair regression; it preserves the failure record rather than deleting it.
- target fingerprint: hash-derived identity of the target content used to invalidate stale completion records after content changes.
- evidence signature: structured failure identity used for deduplication and matching newer resolution evidence.
- suppression: newer matching successful apply/formal completion, an active completion, or a fingerprint-valid `verified-resolution` prevents an old failure from being rediscovered.
- deduplication: duplicate failure signatures are reduced to the newest relevant record.

Cross-target root-cause resolution is deliberately narrower than “a later CoreCheck passed.” It requires the exact original failure signature, failure stage, failed permanent-check identity, verified root-cause file/symbol fingerprint, formal repair target fingerprint, repair regression identity, and successful canonical verification set. Timestamp ordering alone, unrelated apply, dry-run or `applied:false` ordinary execution, failed verification, invalidated fingerprints, and ambiguous/null root-cause identity do not resolve a terminal failure.

On the next process start, repository observation reads this state, validates file existence/fingerprint/symbol and resolution status, and exposes only eligible unresolved evidence to task discovery. A pending in-process repair is preferred; otherwise an explicit user task precedes repository-discovered evidence.

Audited state summary after the runtime-evidence resolution repair: `latest-runtime.json` retains the original terminal failure and contains a separate formal `verified-resolution` for it. On restart-equivalent reread, eligible terminal evidence and runtime-evidence repair findings are both zero; the remaining repository-health cleanup review is report-only and cannot delete automatically.

Migration classification:

- Copy `latest-runtime.json` only when continuity of unresolved/completion evidence matters, the old Controller is gracefully stopped, and the destination is checked out at the matching code state. Transfer it securely outside Git, then rerun canonical verification.
- Logs under `ash/logs` are optional diagnostic history. They are not the canonical task source and are not required to rebuild code.
- Git-tracked source, contracts, regressions, and configuration are reconstructed by clone.
- `node_modules`, save drafts, sandboxes, backup patch files, and caches are regenerated or reviewed separately; do not bulk-copy them as authoritative state.
- Never copy `.git/ash-autonomous-supervisor.lock.json`, `.git/ash-autonomous-supervisor.stop.json`, lock update/write temporaries, or a stale process PID to another PC.

## Controller

Controller entry points:

- `node ash-controller.js`: interactive console (`auto`, `stop`, `exit`, `run`, `corecheck`, `status`).
- `node ash-controller.js --auto`: noninteractive continuous Controller used by Task Scheduler.
- `node ash-controller.js --stop`: repository-local cooperative stop request; it does not kill a process or acquire the supervisor lock.
- `PC-Ash-Controller.bat`: console launcher.
- `PC-Ash-Desktop-Controller.ps1` via `PC-Ash-Desktop-Controller.bat`: desktop status/start/stop UI.

Current Controller contract:

- one repository supervisor owner at a time;
- dirty repository blocks autonomous apply startup without reset/restore;
- each run has a unique `controllerRunId`; old latest logs cannot satisfy the current run;
- `no_repository_task` enters a 5-minute idle delay;
- transient Provider/network failure uses exponential backoff from 15 seconds up to 15 minutes;
- approval, safety, ambiguity, dirty, and lock blocks do not loop automatically;
- current child is allowed to finish during graceful stop;
- accepted stop waits for apply/CoreCheck/evidence/result completion before lock release.
- a repeated cooperative stop returns `cooperative_stop_already_requested` while the current-owner request remains unconsumed; after the Controller has consumed it, another request for the same verified live owner may safely return `cooperative_stop_requested`;
- Controller shutdown requesting is idempotent even when cooperative stop is requested repeatedly;
- Controller lifecycle regressions reproduce the production `ash/logs/*.json` ignore contract and impose finite deadlines on spawned Controllers so a fixture failure cannot hang CoreCheck indefinitely.

## Repository lock and cooperative stop

Supervisor lock:

```text
.git/ash-autonomous-supervisor.lock.json
```

It contains repository identity, Controller PID, optional active child PID, owner kind/token, and timestamps. The Controller owns it for continuous operation. A direct `ash-auto-dev.js --apply` owns it for that invocation unless it is an authorized Controller child carrying the inherited token.

A live Controller PID or active child PID prevents stale recovery. A lock is reclaimed only when its structured record is valid and neither PID is live. Malformed/unverifiable locks fail safe. Never delete a live lock or copy any lock to a new PC.

Cooperative stop request:

```text
.git/ash-autonomous-supervisor.stop.json
```

`--stop` verifies a live `ash-controller` lock owner and writes repository identity, Controller PID, owner token, request type, and timestamp. The Controller checks it every 250 ms, including during idle, and again at child completion. Only an exact current-owner request is consumed. Old-token, old-timestamp, malformed, and cross-repository requests do not stop a new Controller.

Safe stop:

```powershell
cd C:\Users\Owner\StudioProjects\Ash
node .\ash-controller.js --stop
```

Wait until the Scheduled Task is no longer `Running`, both Node command lines are absent, and both lock/request files are absent. Do not use `Stop-ScheduledTask`, `Stop-Process`, `taskkill`, SIGTERM emulation, or Task Scheduler force termination as the normal stop route.

## Windows Task Scheduler

Audited registered Task (read from Windows; it had never run at audit time):

- Task name/path: `Ash Autonomous Controller`, `\`
- State: `Ready`
- Trigger: at logon for `DESKTOP-85KDF66\Owner`
- Principal: local `Owner` (same SID as `DESKTOP-85KDF66\Owner`)
- Logon type: `Interactive`
- Run level: `Limited`
- Program: `C:\Program Files\nodejs\node.exe`
- Arguments: `"C:\Users\Owner\StudioProjects\Ash\ash-controller.js" --auto`
- Working directory: `C:\Users\Owner\StudioProjects\Ash`
- Multiple instances: `IgnoreNew`
- StartWhenAvailable: enabled
- Execution time limit: none (`PT0S`)
- Start on battery: allowed (`DisallowStartIfOnBatteries = false`)
- Stop on battery transition: disabled (`StopIfGoingOnBatteries = false`)
- Failure restart: 3 attempts, 5-minute interval

Subsequent operational verification on 2026-08-18, without changing the registered Task definition, established these distinct results:

- Scheduled Task manual lifecycle: **VERIFIED**.
- Windows logon trigger automatic startup: **VERIFIED** (`Windows logon -> Scheduled Task -> ash-controller.js --auto -> ash-auto-dev.js --apply`).
- Cooperative shutdown: **VERIFIED**; the real run ended with the Task `Ready`, no Controller or `ash-auto-dev` process, no supervisor lock, and no cooperative stop request.
- The logon-trigger run's first CoreCheck: **FAILED because of defects in `controller-lifecycle-regression-test.js`**, not because logon startup or cooperative shutdown failed. The fixture omitted the production runtime-log ignore rule and could block itself as `dirty_repository`; its repeated-stop assertion also depended on whether the 250 ms Controller poll had already consumed the first request. Both regression defects are now repaired and permanently covered.
- The production dirty-repository safety gate remains unchanged. No Windows Task Scheduler setting was changed, and the Task was not rerun as part of the regression repair.

Recreate on a new PC only after cloning, dependencies, secrets, canonical verification, and Controller lifecycle verification. Adjust paths and account name for the new PC:

```powershell
$taskName = 'Ash Autonomous Controller'
$root = 'C:\Users\Owner\StudioProjects\Ash'
$node = 'C:\Program Files\nodejs\node.exe'
$controller = Join-Path $root 'ash-controller.js'
$user = "$env:COMPUTERNAME\$env:USERNAME"

$action = New-ScheduledTaskAction `
  -Execute $node `
  -Argument ('"' + $controller + '" --auto') `
  -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$principal = New-ScheduledTaskPrincipal `
  -UserId $user -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -MultipleInstances IgnoreNew `
  -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 5) `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries
$definition = New-ScheduledTask `
  -Action $action -Trigger $trigger `
  -Principal $principal -Settings $settings `
  -Description 'Starts the hardened Ash autonomous controller at Owner logon. Publishing and release remain approval-gated.'
Register-ScheduledTask -TaskName $taskName -InputObject $definition
```

Task registration changes Windows external state and requires explicit approval under `AGENTS.md`. Re-read the registered Task and verify every field; do not assume registration preserved the requested settings.

## Startup and shutdown

Expected startup:

```text
PC power on
  -> Windows logon
  -> Task Scheduler
  -> node ash-controller.js --auto
  -> repository lock and clean gate
  -> autonomous development
  -> no work: 5-minute idle
  -> verified work: resume repair/development
```

Expected shutdown is cooperative `node ash-controller.js --stop`. It requests stop without a signal, prevents another cycle, waits for the active child and its evidence/result write, releases the owner lock, removes the request, and exits normally.

The registered Scheduled Task manual lifecycle, Windows logon-triggered automatic startup, and cooperative shutdown have now been verified on the real machine. The first CoreCheck reached by the logon-triggered run did not report final success because the Controller lifecycle regression itself was defective; that result must not be rewritten as a successful CoreCheck. The fixture defect and scheduling-dependent assertion were subsequently repaired and the canonical verification passed. A repeat Windows logon test is not required for this fixture-only repair unless the Task definition, production Controller startup/shutdown implementation, or operating environment changes.

For physical PC shutdown, first request cooperative stop and verify Task/process/lock termination. Do not rely on Windows process termination to deliver Node SIGINT/SIGTERM handlers.

## Approval policy

Refer to `AGENTS.md` for authoritative wording.

- Normal safe, reversible, in-scope reads, tests, dry-runs, verified edits, and checkpoint commits may proceed under the development contract.
- Destructive/irreversible operations, broad reset/restore, unverified overwrite, and unexpected large changes require explicit direction.
- Push, release, publication, deployment, and material Windows external-state changes require explicit confirmation.
- Required system approval UI must never be bypassed.
- Auto-start does not confer authority to push, release, weaken validation, delete data, or approve high-risk work.

## Important files

- `AGENTS.md`: repository entry, approval, direct-execution, and completion policy.
- `ASH-MIGRATION-MASTER.md`: this migration/recovery entry document.
- `ash/DEVELOPMENT-RULES.md`: authoritative defect and completion sequence.
- `package.json`, `package-lock.json`: npm manifest and reproducible dependency graph.
- `ash-dev-verify.js`: canonical verification command.
- `ash-auto-dev.js`: formal autonomous-development and existing-repair CLI; records results/evidence.
- `ash-controller.js`: interactive/headless supervisor, lock, result identity, retry/idle, and cooperative stop.
- `PC-Ash-Desktop-Controller.ps1`, `PC-Ash-Desktop-Controller.bat`: desktop Controller UI/launcher.
- `PC-Ash-Controller.bat`: console Controller launcher.
- `ash/runtime/corecheck-runtime.js`: CoreCheck, permanent regression registry, Provider Boundary.
- `ash/runtime/autonomous-development-manager.js`: cycle selection, apply/CoreCheck/rollback/repair/completion management.
- `ash/runtime/repository-observation-runtime.js`: source and verified-runtime-evidence observation.
- `ash/runtime/task-discovery-runtime.js`: eligible finding classification and task creation.
- `ash/runtime/runtime-state.js`: persistent runtime/completion/failure evidence and suppression.
- `ash/runtime/queue-task-adapter.js`: execution readiness, including unresolved-target stop.
- `ash/runtime/target-locator.js`: verified target/anchor resolution.
- `ash/runtime/implementation-planner.js`, `edit-planner.js`, `patch-planner.js`: concrete planning and operations.
- `ash/runtime/implementation-provider.js`, `implementation-provider-command.js`, `implementation-provider-registry.js`: Provider boundary and command integration.
- `ash/providers/openai-implementation-provider.mjs`: OpenAI-backed implementation generation and semantic enforcement.
- `ash/runtime/development-pipeline-runtime.js`: provider-to-validation-to-apply orchestration.
- `ash/runtime/patch-validator.js`: patch safety and semantic validation.
- `ash/runtime/patch-apply-engine.js`: validated apply, backup, and rollback.
- `ash/runtime/completion-evidence.js`: repository-derived formal completion eligibility.
- `ash/runtime/controller-lifecycle-regression-test.js`: permanent Controller lock/start/stop/result lifecycle integration.

## Logs and generated artifacts

Git-tracked and authoritative:

- production source, contracts, regression tests, package files, and this master document;
- Git history that has actually been committed and pushed.

Optional continuity/audit data, ignored by Git:

- `ash/runtime-state/latest-runtime.json`: copy only when runtime evidence continuity is required;
- `ash/logs/ash-auto-dev-*.json` and `ash/logs/ash-controller-*.json`: optional diagnostics, not task authority;
- `.env`: recreate securely; never commit.

Regenerated or normally omitted:

- `node_modules` via `npm ci`;
- caches, sandboxes, save drafts, and ordinary generated reports;
- patch backups after their related work has been safely completed and separately reviewed.

Do not migrate as active state:

- supervisor lock, cooperative stop request, update/write/stale lock temporaries;
- PID-bearing process state;
- incomplete `.backup.patch-apply-*` material without a deliberate recovery review;
- malformed runtime state or a runtime state from a different/unverified repository snapshot.

## Fresh PC migration procedure

1. Install supported 64-bit Windows, Git for Windows, and Node.js/npm. Record their exact versions and executable paths.
2. Clone the GitHub repository into the intended canonical path and switch to `master`.
3. Fetch and confirm the required checkpoint exists. Resolve any known local-only checkpoint from a verified backup; never assume GitHub contains unpushed work.
4. Run `npm ci`. Do not copy `node_modules`.
5. Recreate `.env` or `ASH_OPENAI_ENV_FILE` through an approved secret channel. Configure `OPENAI_API_KEY`; configure `OPENAI_API_MODEL` only when intentionally overriding the default. Never print or commit secrets.
6. Confirm `git status --short --branch`, HEAD, `origin/master`, remote URL, and ahead/behind.
7. Run `node .\ash-dev-verify.js` and require development verification, CoreCheck, all permanent regressions, and Provider Boundary to pass.
8. Run Controller lifecycle regressions directly. Confirm no real supervisor lock/request exists afterward.
9. If continuity is needed, gracefully stop the old Controller, securely copy only `ash/runtime-state/latest-runtime.json`, verify its JSON and matching repository fingerprint context, then rerun canonical verification. Copy logs only for optional audit history.
10. Run one relevant explicit autonomous dry-run. Do not accept report-only or `no_repository_task` as completion evidence for a repair.
11. Recreate the Scheduled Task with new-PC paths/account only after explicit approval. Re-read all Task fields.
12. Before the first real start, require a clean synchronized repository, no live Ash processes, and no lock/request files.
13. Perform one bounded Task Scheduler lifecycle: start, observe exact run ID/result, then use `node .\ash-controller.js --stop`; verify graceful child completion and lock/request removal.
14. Only after the lifecycle passes, rely on logon auto-start. Continue to require explicit approval for push/release/external changes.

## Disaster recovery

If the old PC is completely lost and only GitHub remains, a fresh machine can recover all pushed source, contracts, permanent regressions, dependency declarations, and Git history. It cannot recover:

- unpushed commits or dirty working-tree changes;
- ignored `latest-runtime.json` evidence/completion history;
- ignored runtime/controller logs;
- `.env` or any credential;
- Windows Scheduled Task registration and local account/SID;
- local patch backups, drafts, or caches.

Without runtime state, Ash can still verify and operate from Git, but unresolved failure continuity and local formal-completion suppression records may be lost. Reconstruct facts from pushed source and trustworthy external backups; do not mine free-form old logs into invented tasks.

## Final verification after migration

Minimum checks:

```powershell
git status --short --branch
git rev-parse HEAD
git rev-parse origin/master
git rev-list --left-right --count origin/master...HEAD
npm ci
node --check .\ash-auto-dev.js
node --check .\ash-controller.js
node .\ash\runtime\controller-lifecycle-regression-test.js
node .\ash\runtime\controller-desktop-shutdown-regression-test.js
git diff --check
node .\ash-dev-verify.js
```

Also verify the Provider credential without printing it, confirm Provider Boundary in canonical output, inspect Task Scheduler settings, and perform the bounded scheduled lifecycle described above. A real defect additionally requires the completion evidence specified by `ash/DEVELOPMENT-RULES.md`.

## Current status

- Runtime-evidence-repair baseline HEAD and `origin/master`: `475b7c61e4612d4a20b30b2dde5a4c2718c8c76d`
- Branch: `master`
- Working tree before the runtime-evidence repair: clean
- Ahead/behind before the runtime-evidence repair: ahead 0 / behind 0
- Canonical verification: successful after the Controller lifecycle regression repair and runtime-evidence root-cause resolution repair
- CoreCheck/all permanent regressions/Provider Boundary: successful
- Controller: not running; no supervisor lock or stop request
- Scheduled Task: registered, enabled, `Ready`; manual lifecycle and logon-trigger startup verified
- Release: not performed
- Controller lifecycle commits `a2fcc6f` and `475b7c6` are present on `origin/master`. **CURRENTLY PENDING:** checkpoint the verified runtime-evidence repair; push is not authorized for this checkpoint.

## Maintenance rule

This file stores stable migration/recovery facts, not per-run history. At every checkpoint that changes architecture, dependencies, environment requirements, Controller behavior, Task Scheduler configuration, startup/shutdown, runtime evidence ownership, or migration/recovery procedure, explicitly assess whether this document must be updated. Update it in the same checkpoint when migration or recovery behavior changed.

The permanent enforcement hook is `AGENTS.md`, verified by the existing development completion contract regression. Keep authoritative rule detail in its owning implementation/contract rather than creating a second rule system here.
