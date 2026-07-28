import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
const decryptScript = resolve(
  projectDirectory,
  "scripts",
  "decrypt-session-token.ps1",
);
const serverPath = resolve(projectDirectory, "dist", "index.js");
const powershellPath =
  "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";

const decrypted = spawnSync(
  powershellPath,
  [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    decryptScript,
  ],
  {
    encoding: "utf8",
    maxBuffer: 64 * 1024,
    windowsHide: true,
  },
);

const sessionToken = decrypted.stdout.trim();
if (decrypted.status !== 0 || sessionToken.length < 16) {
  const message =
    decrypted.stderr.trim() ||
    "The encrypted Kagi credential could not be loaded.";
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

const server = spawn(process.execPath, [serverPath], {
  cwd: projectDirectory,
  env: {
    ...process.env,
    KAGI_SESSION_TOKEN: sessionToken,
  },
  stdio: "inherit",
  windowsHide: true,
});

server.once("error", () => {
  process.stderr.write("The Kagi MCP server could not be started.\n");
  process.exit(2);
});

server.once("exit", (code) => {
  process.exit(code ?? 1);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    server.kill(signal);
  });
}
