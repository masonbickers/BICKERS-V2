import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const emulatorDirectory = path.join(os.homedir(), ".cache", "firebase", "emulators");
const jars = (await readdir(emulatorDirectory))
  .filter((name) => /^cloud-firestore-emulator-v.*\.jar$/.test(name))
  .sort();
if (!jars.length) throw new Error("Firestore emulator is not cached. Run Firebase emulators once to download it.");

const port = 8089;
const emulator = spawn("java", [
  "-jar",
  path.join(emulatorDirectory, jars.at(-1)),
  "--host", "127.0.0.1",
  "--port", String(port),
  "--rules", path.join(root, "firestore.rules"),
  "--project_id", "bickers-timesheet-rules-test",
  "--single_project_mode", "true",
  "start",
], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });

let emulatorOutput = "";
emulator.stdout.on("data", (chunk) => { emulatorOutput += chunk; });
emulator.stderr.on("data", (chunk) => { emulatorOutput += chunk; });

function waitForPort(timeoutMs = 20_000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.createConnection({ host: "127.0.0.1", port });
      socket.once("connect", () => { socket.destroy(); resolve(); });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - startedAt >= timeoutMs) reject(new Error(`Firestore emulator did not start.\n${emulatorOutput}`));
        else setTimeout(attempt, 150);
      });
    };
    attempt();
  });
}

try {
  await waitForPort();
  const tests = spawn(process.execPath, ["--test", "tests/timesheetRules.test.mjs"], {
    cwd: root,
    env: { ...process.env, FIRESTORE_EMULATOR_HOST: `127.0.0.1:${port}` },
    stdio: "inherit",
  });
  const exitCode = await new Promise((resolve) => tests.once("exit", (code) => resolve(code ?? 1)));
  process.exitCode = exitCode;
} finally {
  emulator.kill("SIGTERM");
}
