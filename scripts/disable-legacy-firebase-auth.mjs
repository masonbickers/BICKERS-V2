import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cert, getApps, initializeApp } from "firebase-admin/app";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apply = process.argv.includes("--apply");

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).reduce((env, line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || line.trimStart().startsWith("#")) return env;
    env[match[1]] = match[2].replace(/^(\"|')(.*)\1$/, "$2");
    return env;
  }, {});
}

const env = { ...loadEnv(path.join(root, ".env.local")), ...process.env };
const required = (name) => {
  const value = String(env[name] || "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

async function main() {
  const projectId = String(env.FIREBASE_PROJECT_ID || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "").trim();
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID is required.");
  if (!apply) {
    console.log(JSON.stringify({ mode: "dry-run", projectId, emailPasswordSignIn: "disable" }, null, 2));
    return;
  }
  if (!process.argv.includes("--confirm-disable-email-password")) {
    throw new Error("Apply mode also requires --confirm-disable-email-password.");
  }

  const app = getApps()[0] || initializeApp({
    projectId,
    credential: cert({
      projectId,
      clientEmail: required("FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL"),
      privateKey: required("FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n"),
    }),
  });
  const token = await app.options.credential.getAccessToken();
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${encodeURIComponent(projectId)}/config?updateMask=signIn.email.enabled`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ signIn: { email: { enabled: false } } }),
    }
  );
  if (!response.ok) throw new Error(`Identity Platform update failed with HTTP ${response.status}.`);
  console.log(JSON.stringify({ mode: "apply", projectId, emailPasswordSignIn: "disabled" }, null, 2));
}

main().catch((error) => {
  console.error(`Legacy authentication shutdown stopped: ${error?.message || error}`);
  process.exitCode = 1;
});
