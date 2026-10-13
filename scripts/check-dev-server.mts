/**
 * Wait for the dev server to be ready, then smoke-check the routes that matter.
 *
 * A Next.js dev server compiles a route on first request, so the first hit is
 * slow and later ones are fast. Neon may also need to wake from suspension. This
 * therefore retries the first request generously, then asserts the pages render
 * and — importantly — that data actually came back from the database, so
 * "server is up" is not mistaken for "the app works".
 */
const base = "http://127.0.0.1:3000";

const results: string[] = [];
const check = (label: string, ok: boolean, detail = "") =>
  results.push(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);

/** Poll a path until it answers below 500, or the deadline passes. */
async function waitFor(path: string, timeoutMs: number): Promise<number | null> {
  const deadline = Date.now() + timeoutMs;
  let last: number | null = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}${path}`, { redirect: "manual" });
      last = res.status;
      if (res.status < 500) return res.status;
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return last;
}

const started = Date.now();

if (process.argv.includes("--once")) {
  // Just report readiness; used when the server was already verified.
  const status = await waitFor("/login", 120_000);
  console.log(status === null ? "NOT READY" : `ready — /login HTTP ${status}`);
  process.exit(status === null ? 1 : 0);
}

/* --- readiness ---------------------------------------------------------- */

const loginStatus = await waitFor("/login", 180_000);
const readyMs = Date.now() - started;
check("Dev server is listening", loginStatus !== null, `after ${(readyMs / 1000).toFixed(1)}s`);

if (loginStatus === null) {
  console.log(results.join("\n"));
  console.log("\nThe server never answered. Check the dev server output.");
  process.exit(1);
}

/* --- the sign-in page, which proves the database is reachable ----------- */

const login = await fetch(`${base}/login`);
const loginHtml = await login.text();
check("Sign-in page renders", login.status === 200, `HTTP ${login.status}`);
check(
  "Demo accounts loaded from the database",
  loginHtml.includes("physician@buhangin.example.ph"),
  "proves the connection to Neon works",
);
check(
  "Sign-in form is present",
  /password/i.test(loginHtml) && /email/i.test(loginHtml),
);

/* --- public tracking, which reads a referral by code -------------------- */

const track = await fetch(`${base}/track?ref=HL-2026-BUH-00001&code=TPGYW-Z8W4C`);
const trackHtml = await track.text();
check("Public tracking page renders", track.status === 200, `HTTP ${track.status}`);
check(
  "Tracking resolves a seeded referral",
  /HL-2026-BUH-00001/.test(trackHtml),
  "the lookup ran against the database",
);

/* --- the FHIR facade, which is pure read --------------------------------- */

const meta = await fetch(`${base}/fhir/metadata`);
let capabilityOk = false;
try {
  const json = (await meta.json()) as { resourceType?: string };
  capabilityOk = json.resourceType === "CapabilityStatement";
} catch {
  /* not JSON */
}
check("FHIR CapabilityStatement served", meta.status === 200 && capabilityOk, `HTTP ${meta.status}`);

/* --- protected page redirects an anonymous visitor ---------------------- */

const dash = await fetch(`${base}/dashboard`, { redirect: "manual" });
check(
  "Protected route redirects to sign-in when signed out",
  dash.status === 302 || dash.status === 307,
  `HTTP ${dash.status}`,
);

console.log(results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
console.log(`First response after ${(readyMs / 1000).toFixed(1)}s (dev-server compile).`);
process.exit(failed ? 1 : 0);
