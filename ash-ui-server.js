const http = require("http");
const { execFile } = require("child_process");

const PORT = 51777;

function runAsh(task, dryRun = true) {
  return new Promise((resolve) => {
    const args = ["ash-auto-dev.js"];

    if (task && task.trim()) {
      args.push("--task", task.trim());
    }

    if (dryRun) {
      args.push("--dry-run");
    } else {
      args.push("--apply");
    }

    execFile("node", args, {
      cwd: __dirname,
      timeout: 120000,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      resolve({
        success: !error,
        error: error ? String(error.message || error) : null,
        stdout: stdout || "",
        stderr: stderr || "",
        time: new Date().toISOString(),
      });
    });
  });
}

function page() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>PC Ash</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; background: #101114; color: #f2f2f2; }
    header { padding: 16px 20px; background: #181a20; border-bottom: 1px solid #333; }
    main { padding: 20px; display: grid; gap: 16px; }
    textarea { width: 100%; height: 90px; background: #161820; color: #fff; border: 1px solid #444; border-radius: 8px; padding: 10px; }
    button { padding: 10px 14px; border: 0; border-radius: 8px; cursor: pointer; font-weight: 700; }
    pre { white-space: pre-wrap; background: #07080a; border: 1px solid #333; border-radius: 8px; padding: 14px; min-height: 260px; }
    .row { display: flex; gap: 10px; align-items: center; }
    .pill { padding: 4px 8px; background: #252936; border-radius: 999px; font-size: 12px; }
  </style>
</head>
<body>
  <header>
    <h1>PC Ash Console</h1>
    <div class="row">
      <span class="pill">Local</span>
      <span class="pill">Port ${PORT}</span>
      <span class="pill">OpenAI Ash = Support</span>
    </div>
  </header>
  <main>
    <section>
      <h2>Instruction</h2>
      <textarea id="task" placeholder="PC Ashへの指示を書く"></textarea>
      <div class="row">
        <button onclick="run(true)">Dry Run</button>
        <button onclick="run(false)">Apply</button>
        <button onclick="refresh()">Refresh State</button>
      </div>
    </section>
    <section>
      <h2>Output</h2>
      <pre id="out">Ready.</pre>
    </section>
  </main>
<script>
async function run(dryRun) {
  const task = document.getElementById("task").value;
  const out = document.getElementById("out");
  out.textContent = "Running PC Ash...";
  const res = await fetch("/run", {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({ task, dryRun })
  });
  const json = await res.json();
  out.textContent =
    "Status: " + json.success + "\\n" +
    "Time: " + json.time + "\\n\\n" +
    "STDOUT:\\n" + json.stdout + "\\n\\n" +
    "STDERR:\\n" + json.stderr + "\\n\\n" +
    "ERROR:\\n" + (json.error || "");
}

async function refresh() {
  document.getElementById("task").value = "show current PC Ash state";
  await run(true);
}
</script>
</body>
</html>`;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, {"content-type": "text/html; charset=utf-8"});
    res.end(page());
    return;
  }

  if (req.method === "POST" && req.url === "/run") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      let input = {};
      try { input = JSON.parse(body || "{}"); } catch {}
      const result = await runAsh(input.task || "", input.dryRun !== false);
      res.writeHead(200, {"content-type": "application/json; charset=utf-8"});
      res.end(JSON.stringify(result, null, 2));
    });
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`PC Ash UI running: http://127.0.0.1:${PORT}`);
});

