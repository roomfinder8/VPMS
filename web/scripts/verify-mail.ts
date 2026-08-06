/**
 * Checks that the Gmail credentials in .env.local actually authenticate,
 * without sending anything to anybody.
 *
 *   npx tsx scripts/verify-mail.ts
 *
 * Reads the env file directly rather than relying on the Next runtime, so it
 * can be run on its own.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";

async function loadEnv(file: string): Promise<Record<string, string>> {
  const raw = await readFile(file, "utf8");
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

async function main() {
  const env = await loadEnv(path.join(process.cwd(), ".env.local"));

  const user = env.GMAIL_USER;
  const pass = env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");

  console.log(`GMAIL_USER          : ${user || "(empty)"}`);
  console.log(
    `GMAIL_APP_PASSWORD  : ${pass ? `${pass.length} characters` : "(empty)"}`,
  );

  if (!user || !pass) {
    console.error("\nBoth must be set before the report can be emailed.");
    process.exit(1);
  }
  if (pass.length !== 16) {
    console.warn(
      `\nWarning: a Google App Password is 16 characters; this one is ${pass.length}.`,
    );
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });

  await transporter.verify();
  console.log("\nSMTP login succeeded — no message was sent.");
}

main().catch((err) => {
  console.error(`\nSMTP login FAILED: ${err.message}`);
  process.exit(1);
});
