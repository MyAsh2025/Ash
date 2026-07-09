"use strict";

const readline = require("readline");
const { execFileSync, spawnSync } = require("child_process");

function run(command, args = []) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: false
  });

  return {
    status: result.status,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
    success: result.status === 0
  };
}

function gitStatus() {
  return {
    branch: run("git", ["branch", "--show-current"]).stdout || "unknown",
    status: run("git", ["status", "--short"]).stdout,
    latestCommit: run("git", ["rev-parse", "--short", "HEAD"]).stdout || "unknown",
    latestMessage: run("git", ["log", "-1", "--pretty=%s"]).stdout || "unknown"
  };
}

function printHeader() {
  const git = gitStatus();
  const clean = git.status.length === 0;

  console.clear();
  console.log("==============================================");
  console.log("              PC Ash Controller");
  console.log("==============================================");
  console.log("");
  console.log(`Project       Ash`);
  console.log(`Branch        ${git.branch}`);
  console.log(`Git           ${clean ? "Clean" : "Dirty"}`);
  console.log(`Latest        ${git.latestCommit} ${git.latestMessage}`);
  console.log("");
  console.log("----------------------------------------------");
  console.log("Commands");
  console.log("----------------------------------------------");
  console.log("status       Show repository status");
  console.log("run          Run autonomous development once");
  console.log("auto         Run autonomous development 10 cycles apply");
  console.log("corecheck    Run Ash auto-dev corecheck route");
  console.log("git          Show git summary");
  console.log("exit         Exit controller");
  console.log("");
}

function runAutoDev(args) {
  console.log("");
  console.log(`> node ash-auto-dev.js ${args.join(" ")}`);
  console.log("");

  const result = spawnSync("node", ["ash-auto-dev.js", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: false
  });

  if (result.stdout) console.log(result.stdout.trim());
  if (result.stderr) console.error(result.stderr.trim());

  return result.status;
}

function printStatus() {
  const git = gitStatus();
  console.log("");
  console.log("Repository");
  console.log("----------------------------------------------");
  console.log(`Branch        ${git.branch}`);
  console.log(`Latest        ${git.latestCommit} ${git.latestMessage}`);
  console.log(`Clean         ${git.status.length === 0}`);
  if (git.status) {
    console.log("");
    console.log(git.status);
  }
  console.log("");
}

function promptLoop() {
  printHeader();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "ash> "
  });

  rl.prompt();

  rl.on("line", (line) => {
    const command = line.trim().toLowerCase();

    if (!command) {
      rl.prompt();
      return;
    }

    if (command === "exit" || command === "quit") {
      rl.close();
      return;
    }

    if (command === "status" || command === "git") {
      printStatus();
      rl.prompt();
      return;
    }

    if (command === "run") {
      runAutoDev(["--cycles", "1", "--apply"]);
      rl.prompt();
      return;
    }

    if (command === "auto") {
      runAutoDev(["--cycles", "10", "--apply"]);
      rl.prompt();
      return;
    }

    if (command === "corecheck") {
      runAutoDev(["--task", "corecheck"]);
      rl.prompt();
      return;
    }

    if (command === "clear") {
      printHeader();
      rl.prompt();
      return;
    }

    console.log(`Unknown command: ${command}`);
    rl.prompt();
  });

  rl.on("close", () => {
    console.log("PC Ash Controller stopped.");
    process.exit(0);
  });
}

promptLoop();
