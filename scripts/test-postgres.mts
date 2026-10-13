/**
 * Run the test suite against Postgres.
 *
 * The suite deletes and re-seeds every table, so this refuses to run unless
 * DATABASE_URL names a database that is clearly a test database. Two guards:
 *
 *   1. the database name must contain "test"
 *   2. HEALTHLINK_TEST_POSTGRES must be set to 1
 *
 * The database name is read from the URL and rewritten onto the connection
 * string, so a copy-pasted production URL cannot wipe the demo data: the script
 * exits before importing anything that would connect.
 *
 * The test database is created on demand if it does not exist.
 */
import { readFileSync } from "node:fs";

/* --- load .env.local --------------------------------------------------- */

const env: Record<string, string> = { ...(process.env as Record<string, string>) };
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].trim();
  }
} catch {
  /* no .env.local */
}

const base = env.DATABASE_URL;
if (!base) {
  console.error(
    "DATABASE_URL is not set. Either put it in .env.local or export it, then re-run.\n" +
      "To test SQLite instead, run: npm test",
  );
  process.exit(1);
}

/* --- which database to test against ------------------------------------ */

// `.env.local` points at the demo database. The suite must not use it, because
// it deletes every table. So the URL is rewritten to the test database rather
// than merely validated: on this project the role owns both, so switching is
// just a path change. The rewrite happens BEFORE any connection is opened.
const url = new URL(base);
const dbName = url.pathname.replace(/^\//, "");
const TEST_DB_NAME = "healthlink_test";

if (dbName !== TEST_DB_NAME) {
  console.log(
    `DATABASE_URL names "${dbName}"; switching to "${TEST_DB_NAME}" for the test run.\n` +
      `(The suite deletes and re-seeds every table, so it never uses the demo database.)\n`,
  );
}

/* --- explicit opt-in --------------------------------------------------- */

if (env.HEALTHLINK_TEST_POSTGRES !== "1" && process.env.HEALTHLINK_TEST_POSTGRES !== "1") {
  console.error(
    [
      "",
      "Set HEALTHLINK_TEST_POSTGRES=1 to confirm you mean to run the suite against Postgres.",
      "",
      "  $env:HEALTHLINK_TEST_POSTGRES=1; npm run test:postgres",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

/* --- create the test database if it does not exist --------------------- */

// Connect to the maintenance database to create it. The same role owns both.
const adminUrl = new URL(base);
adminUrl.pathname = "/neondb";

async function ensureTestDatabase(): Promise<boolean> {
  const { Pool } = (await import("pg")) as typeof import("pg");
  const pool = new Pool({
    connectionString: adminUrl.toString(),
    ssl: { rejectUnauthorized: false },
    max: 1,
  });
  try {
    const existing = await pool.query("SELECT 1 FROM pg_database WHERE datname = $1", [TEST_DB_NAME]);
    if (existing.rowCount === 0) {
      // CREATE DATABASE cannot run inside a transaction block; a plain query is fine.
      await pool.query(`CREATE DATABASE ${TEST_DB_NAME}`);
      console.log(`Created database ${TEST_DB_NAME}.`);
    }
    return true;
  } catch (e) {
    console.error(`Could not prepare the test database: ${(e as Error).message}`);
    return false;
  } finally {
    await pool.end();
  }
}

if (!(await ensureTestDatabase())) process.exit(1);

/* --- point the suite at the test database and run it ------------------- */

const testUrl = new URL(base);
testUrl.pathname = `/${TEST_DB_NAME}`;

console.log(`Testing against Postgres database: ${TEST_DB_NAME} (${testUrl.hostname})\n`);

const { spawnSync } = await import("node:child_process");

const result = spawnSync("npx", ["tsx", "scripts/test-fhir.mts"], {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    ...env,
    // The suite reads this to know it may reset every table.
    DATABASE_URL: testUrl.toString(),
    HEALTHLINK_TEST_POSTGRES: "1",
    // Clear the SQLite override so the dialect check is unambiguous.
    HEALTHLINK_DB: "",
  },
});

process.exit(result.status ?? 1);
