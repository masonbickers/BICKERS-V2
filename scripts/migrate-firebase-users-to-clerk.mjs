import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const fileArg = process.argv.find((arg) => arg.startsWith("--file="));
const emailArg = process.argv.find((arg) => arg.startsWith("--email="));
const requestedEmail = String(emailArg?.slice("--email=".length) || "").trim().toLowerCase();
const exportPath = fileArg
  ? path.resolve(root, fileArg.slice("--file=".length))
  : "/tmp/bickers-firebase-users.json";

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).reduce((env, line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || match[1].startsWith("#")) return env;
    const value = match[2].replace(/^(["'])(.*)\1$/, "$2");
    env[match[1]] = value;
    return env;
  }, {});
}

const env = { ...loadEnv(path.join(root, ".env.local")), ...process.env };
const requiredHashConfig = [
  "FIREBASE_AUTH_SIGNER_KEY",
  "FIREBASE_AUTH_SALT_SEPARATOR",
  "FIREBASE_AUTH_ROUNDS",
  "FIREBASE_AUTH_MEM_COST",
];

function fail(message) {
  console.error(`Migration stopped: ${message}`);
  process.exitCode = 1;
}

function firebaseDigest(user) {
  return [
    user.passwordHash,
    user.salt,
    env.FIREBASE_AUTH_SIGNER_KEY,
    env.FIREBASE_AUTH_SALT_SEPARATOR,
    env.FIREBASE_AUTH_ROUNDS,
    env.FIREBASE_AUTH_MEM_COST,
  ].join("$");
}

async function clerkRequest(pathname, options = {}) {
  const res = await fetch(`https://api.clerk.com/v1${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.CLERK_SECRET_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  return res;
}

async function clerkUserExists(email) {
  const res = await clerkRequest(`/users?email_address=${encodeURIComponent(email)}&limit=1`);
  if (!res.ok) throw new Error(`Clerk user lookup returned HTTP ${res.status}.`);
  const data = await res.json();
  const users = Array.isArray(data) ? data : data?.data || [];
  return users.length > 0;
}

async function main() {
  if (!fs.existsSync(exportPath)) {
    fail(`Firebase export not found at ${exportPath}. Run firebase auth:export first.`);
    return;
  }

  const exported = JSON.parse(fs.readFileSync(exportPath, "utf8"));
  const allUsers = Array.isArray(exported?.users) ? exported.users : [];
  const candidates = allUsers.filter((user) => {
    const email = String(user?.email || "").trim().toLowerCase();
    return (
      email.endsWith("@bickers.co.uk") &&
      user?.passwordHash &&
      user?.salt &&
      (!requestedEmail || email === requestedEmail)
    );
  });

  console.log(`Firebase export records: ${allUsers.length}`);
  console.log(`Eligible Bickers email/password users: ${candidates.length}`);

  if (requestedEmail && !candidates.length) {
    fail(`No eligible Firebase password user was found for ${requestedEmail}.`);
    return;
  }

  if (dryRun) {
    console.log("Dry run complete. No Clerk users were created.");
    return;
  }

  if (!env.CLERK_SECRET_KEY) {
    fail("CLERK_SECRET_KEY is missing from .env.local.");
    return;
  }

  const missingHashConfig = requiredHashConfig.filter((key) => !env[key]);
  if (missingHashConfig.length) {
    fail(`Missing Firebase password hash settings: ${missingHashConfig.join(", ")}.`);
    return;
  }

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const user of candidates) {
    const email = String(user.email).trim().toLowerCase();
    try {
      if (await clerkUserExists(email)) {
        skipped += 1;
        console.log(`Skipped existing Clerk user: ${email}`);
        continue;
      }

      const res = await clerkRequest("/users", {
        method: "POST",
        body: JSON.stringify({
          email_address: [email],
          external_id: String(user.localId || ""),
          password_hasher: "scrypt_firebase",
          password_digest: firebaseDigest(user),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const detail = Array.isArray(body?.errors)
          ? body.errors.map((item) => item.long_message || item.message || item.code).filter(Boolean).join("; ")
          : "";
        throw new Error(`Clerk user creation returned HTTP ${res.status}${detail ? `: ${detail}` : "."}`);
      }
      created += 1;
      console.log(`Imported: ${email}`);
    } catch (error) {
      failed += 1;
      console.error(`Failed to import ${email}: ${error.message}`);
    }
  }

  console.log(`Migration complete. Created: ${created}; skipped: ${skipped}; failed: ${failed}.`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => fail(error.message || "Unexpected migration error."));
