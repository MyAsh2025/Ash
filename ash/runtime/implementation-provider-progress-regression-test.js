"use strict";

const {
  createCommandProvider
} = require("./implementation-provider-command");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const captured = [];
const originalWrite =
  process.stderr.write.bind(process.stderr);

process.stderr.write =
  (chunk, ...args) => {
    captured.push(String(chunk));
    return true;
  };

let result;

try {
  const provider =
    createCommandProvider({
      command: process.execPath,
      args: [
        "-e",
        "process.stdout.write(JSON.stringify({success:true,providerName:'progress-regression',executableCodeTemplate:'return null;'}))"
      ],
      timeoutMs: 5000
    });

  result = provider({
    task: "progress regression"
  });
} finally {
  process.stderr.write =
    originalWrite;
}

const progressText =
  captured.join("");

assert(
  result?.success === true,
  "Command provider regression invocation failed."
);

assert(
  progressText.includes(
    "[Ash] implementation-provider start"
  ),
  "Provider start progress message was not emitted."
);

assert(
  progressText.includes(
    "timeout=5000ms"
  ),
  "Provider progress did not expose its timeout."
);

assert(
  progressText.includes(
    "[Ash] implementation-provider complete"
  ),
  "Provider completion progress message was not emitted."
);

assert(
  /elapsed=\d+ms/.test(progressText),
  "Provider completion progress did not expose elapsed time."
);

console.log(
  JSON.stringify(
    {
      mode:
        "implementation-provider-progress-regression-test",
      success: true,
      progressText
    },
    null,
    2
  )
);
