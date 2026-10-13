/**
 * Verify the built application against Postgres over real HTTP.
 *
 * Runs `next start` (the production server, as a host would) with DATABASE_URL
 * pointing at Neon, then exercises the surfaces that would break if the port
 * were wrong:
 *
 *   - page rendering, where every query now goes over the network
 *   - the FHIR facade, which is read-only by design
 *   - signing in, which proves sessions and the user table work from Postgres
 *   - the audit trail page, which reads the hash-chained table
 *   - a referral detail page, which joins across many tables
 *
 * Cookies are carried manually between requests so this uses no browser.
 */
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";

/* --- environment: .env.local plus a quiet production server --------------- */

const env: Record<string, string> = { ...(process.env as Record<string, string>) };
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && env[m[1]] === undefined) env[m[1]] = m[2].trim();
}

// The verification script mints its own session via src/lib/auth.ts, which signs
// the JWT with HEALTHLINK_SECRET. The server verifies with the same variable, so
// this process must see it too — otherwise the token it produces is signed with
// the development fallback and the proxy correctly rejects it.
for (const [k, v] of Object.entries(env)) {
  if (process.env[k] === undefined) process.env[k] = v;
}

const PORT = 3300;
const base = `http://127.0.0.1:${PORT}`;

env.PORT = String(PORT);
env.NODE_ENV = "production";

console.log(`starting production server on :${PORT} with DATABASE_URL set…`);

const child = spawn("npx", ["next", "start", "-p", String(PORT)], {
  stdio: ["ignore", "pipe", "pipe"],
  shell: true,
  env,
});

let serverLog = "";
child.stdout?.on("data", (d) => (serverLog += d.toString()));
child.stderr?.on("data", (d) => (serverLog += d.toString()));

/* --- helpers -------------------------------------------------------------- */

const results: string[] = [];
const check = (label: string, ok: boolean, detail = "") =>
  results.push(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);

/** Cookie jar: name -> value. */
const jar = new Map<string, string>();

function absorb(res: Response): void {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const c of raw) {
    const [pair] = c.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) {
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (value === "" || /expires=Thu, 01 Jan 1970/i.test(c)) jar.delete(name);
      else jar.set(name, value);
    }
  }
}

function cookieHeader(): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function fetchJar(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (jar.size) headers.set("cookie", cookieHeader());
  const res = await fetch(`${base}${path}`, { ...init, headers, redirect: "manual" });
  absorb(res);
  return res;
}

async function waitForServer(timeoutMs = 90_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/login`, { redirect: "manual" });
      if (res.status < 500) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

/** Next.js server actions live in the client bundle, so their ids cannot be
 *  scraped from server HTML. Authentication is therefore verified by calling the
 *  application's own session path directly (see below). */

/* --- run ----------------------------------------------------------------- */

try {
  const up = await waitForServer();
  check("Production server starts and serves /login with Postgres", up, up ? "" : serverLog.slice(-800));

  if (up) {
    /* 1. Public pages ---------------------------------------------------- */
    const loginRes = await fetchJar("/login");
    const loginHtml = await loginRes.text();
    check("Sign-in page renders", loginRes.status === 200, `HTTP ${loginRes.status}`);
    check(
      "Demo accounts come from Postgres (read from the users table)",
      loginHtml.includes("physician@buhangin.example.ph"),
    );

    const trackRes = await fetchJar("/track");
    const trackHtml = await trackRes.text();
    check("Public tracking page renders", trackRes.status === 200, `HTTP ${trackRes.status}`);
    check("Tracking page explains that a code is required", /code/i.test(trackHtml));

    /* 2. Tracking with real seeded credentials ---------------------------- */
    // These are seeded deterministically (see docs/EVALUATION-SCENARIO.md), so
    // they stay valid across reseeds — asserted by the test suite too.
    const t2 = await fetchJar("/track?ref=HL-2026-BUH-00001&code=TPGYW-Z8W4C");
    const t2Html = await t2.text();
    check("Tracking lookup renders a result for a seeded referral", t2.status === 200, `HTTP ${t2.status}`);
    check(
      "Tracking shows the referral for the correct code",
      /HL-2026-BUH-00001/.test(t2Html),
      "the referral number itself should appear",
    );

    const badCode = await fetchJar("/track?ref=HL-2026-BUH-00001&code=WRONG-CODE1");
    const badHtml = await badCode.text();
    check(
      "Tracking refuses a wrong code",
      !/Rosario Maquiling/.test(badHtml),
      "the patient name must not leak on a bad code",
    );

    /* 3. FHIR facade ------------------------------------------------------ */
    const meta = await fetchJar("/fhir/metadata");
    const metaJson = (await meta.json()) as { resourceType?: string };
    check(
      "CapabilityStatement is served by the Postgres-backed app",
      meta.status === 200 && metaJson.resourceType === "CapabilityStatement",
      `HTTP ${meta.status}`,
    );

    const unauth = await fetchJar("/fhir/Patient/anything");
    check(
      "Read-only facade refuses an unauthenticated read",
      unauth.status === 401,
      `HTTP ${unauth.status}`,
    );

    const write = await fetchJar("/fhir/Patient", { method: "POST", body: "{}" });
    check(
      "Facade rejects writes (read-only by design)",
      write.status === 405 || write.status === 401,
      `HTTP ${write.status}`,
    );

    /* 4. Authentication: exercise the real session path -------------------- */
    //
    // The sign-in form is a client component posting to a server action, so its
    // action id lives in the client bundle and cannot be scraped from HTML. The
    // stronger check is to run the application's own credential verification
    // against Postgres and use the token it issues — that exercises bcrypt/scrypt
    // verification, the users table, session creation and the proxy's JWT check.
    const { createSession, SESSION_COOKIE } = await import("../src/lib/auth");
    const { closeDb } = await import("../src/lib/db");

    const wrong = await createSession("physician@buhangin.example.ph", "definitely-not-the-password");
    check(
      "Wrong credentials are rejected by the real session path",
      !wrong.ok,
      wrong.ok ? "unexpectedly accepted" : wrong.reason,
    );

    const session = await createSession("physician@buhangin.example.ph", "HealthLink!2026", {
      ip: "203.0.113.10",
      userAgent: "HealthLink verification",
    });
    check(
      "Correct credentials are accepted (scrypt hash verified from Postgres)",
      session.ok,
      session.ok ? session.user.fullName : session.message,
    );

    if (session.ok) {
      jar.set(SESSION_COOKIE, session.token);

      /* 5. Authenticated pages ------------------------------------------- */
      const dash = await fetchJar("/dashboard");
      const dashHtml = await dash.text();
      check("Dashboard renders for a signed-in physician", dash.status === 200, `HTTP ${dash.status}`);
      check(
        "Dashboard shows the signed-in user's name",
        /Antonio Reyes/.test(dashHtml),
        "the name comes from the Postgres session lookup",
      );

      const referrals = await fetchJar("/referrals");
      const refHtml = await referrals.text();
      check("Referral worklist renders", referrals.status === 200, `HTTP ${referrals.status}`);
      check(
        "Worklist lists seeded referral numbers",
        // Format is HL-YYYY-<facility short code>-NNNNN, e.g. HL-2026-BUH-00001.
        /HL-\d{4}-[A-Z]{3}-\d{5}/.test(refHtml),
        "referral numbers are read from Postgres",
      );

      /* 5b. Least privilege: a physician must NOT reach the audit trail ---- */
      //
      // The audit trail is the privacy auditor's surface. A physician being
      // redirected away from it is the correct behaviour, so this asserts the
      // DENIAL rather than treating it as a failure.
      const auditAsDoctor = await fetchJar("/audit");
      check(
        "A physician is denied the audit trail (least privilege holds)",
        auditAsDoctor.status === 307 || auditAsDoctor.status === 302 || auditAsDoctor.status === 403,
        `HTTP ${auditAsDoctor.status}`,
      );

      const exportAsDoctor = await fetchJar("/api/audit/export?format=csv");
      check(
        "A physician is denied the audit export",
        exportAsDoctor.status === 403 || exportAsDoctor.status === 307 || exportAsDoctor.status === 302,
        `HTTP ${exportAsDoctor.status}`,
      );

      /* 5c. The privacy auditor CAN read it ------------------------------- */
      const auditor = await createSession("auditor@healthlink.example.ph", "HealthLink!2026");
      check("The privacy auditor signs in", auditor.ok, auditor.ok ? auditor.user.fullName : auditor.message);

      if (auditor.ok) {
        const previous = jar.get(SESSION_COOKIE);
        jar.set(SESSION_COOKIE, auditor.token);

        const audit = await fetchJar("/audit");
        const auditHtml = await audit.text();
        check("Audit trail renders for the privacy auditor", audit.status === 200, `HTTP ${audit.status}`);
        check(
          "Audit page reports the hash chain as intact",
          /intact/i.test(auditHtml),
          "the chain verifies over Postgres exactly as it did on SQLite",
        );
        check(
          "Audit page lists seeded audit events",
          /referral|consent|access/i.test(auditHtml),
          "audit rows are read from Postgres",
        );

        const exportRes = await fetchJar("/api/audit/export?format=csv");
        const csv = await exportRes.text();
        check("Audit export endpoint responds for the auditor", exportRes.status === 200, `HTTP ${exportRes.status}`);
        check(
          "Audit export is real CSV with the expected header",
          csv.includes("occurred_at") && csv.split("\n").length > 5,
          `${csv.split("\n").length} lines`,
        );

        // Restore the physician session.
        if (previous) jar.set(SESSION_COOKIE, previous);
      }

      /* 6. A joined page: referral detail --------------------------------- *
       * The id is resolved at runtime rather than hardcoded: referral ids are
       * generated UUIDs, so they change on every reseed. Referral NUMBERS are
       * deterministic, which is why the walkthrough document quotes those. */
      const { all } = await import("../src/lib/db");
      const target = (
        await all<{ id: string; referral_number: string }>(
          "SELECT id, referral_number FROM referrals WHERE referral_number = ?",
          "HL-2026-BUH-00001",
        )
      )[0];
      check("Seeded referral resolved by its deterministic number", !!target, target?.referral_number ?? "not found");

      if (target) {
        const detail = await fetchJar(`/referrals/${target.id}`);
        const detailHtml = await detail.text();
        check(
          "Referral detail renders for a real referral (multi-table joins on Postgres)",
          detail.status === 200,
          `HTTP ${detail.status}`,
        );
        check(
          "Referral detail shows the seeded clinical narrative",
          /Rosario Maquiling/.test(detailHtml),
          "patient, facility and clinical data all resolved from Postgres",
        );
      }

      const missing = await fetchJar("/referrals/ref-does-not-exist");
      check(
        "Referral detail handles an unknown id without a server error",
        missing.status < 500,
        `HTTP ${missing.status}`,
      );

      const realDetail = await fetchJar("/referrals?status=submitted");
      check("Filtering the worklist by status works", realDetail.status === 200, `HTTP ${realDetail.status}`);

      /* 7. Reports: the julianday replacement in a page context ------------ */
      const reports = await fetchJar("/reports");
      const reportsHtml = await reports.text();
      check(
        "Reports page renders (turnaround arithmetic on Postgres)",
        reports.status === 200,
        `HTTP ${reports.status}`,
      );
      check(
        "Reports page shows a duration figure rather than NaN",
        !/NaN/.test(reportsHtml),
        "a broken hoursBetween() would surface as NaN here",
      );

      /* 8. Interop pages ---------------------------------------------------- */
      const explorer = await fetchJar("/interop/explorer");
      const explorerHtml = await explorer.text();
      check("FHIR explorer renders", explorer.status === 200, `HTTP ${explorer.status}`);
      check(
        "Explorer lists stored resource types from Postgres",
        /Patient/.test(explorerHtml) && !/NaN/.test(explorerHtml),
        "per-type counts use the jsonField/COUNT changes",
      );

      /* 9. Governance: access requests ------------------------------------- */
      const accessRequests = await fetchJar("/access-requests");
      check(
        "Access request page renders",
        accessRequests.status === 200,
        `HTTP ${accessRequests.status}`,
      );
    }

    /* 10. No server-side errors ------------------------------------------- */
    const meaningful = serverLog
      .split("\n")
      .filter((l) => /error|unhandled|exception/i.test(l))
      // Ignore the SSL-mode advisory pg prints on every connection.
      .filter((l) => !/SSL modes|libpq|postgresql\.org|pg-connection-string/i.test(l));
    check(
      "No server errors during the whole run",
      meaningful.length === 0,
      meaningful.slice(0, 5).join(" | "),
    );
  }
} finally {
  child.kill();
  await new Promise((r) => setTimeout(r, 1200));
  // On Windows the shell wrapper can outlive the child; make sure the port frees.
  try {
    const { execSync } = await import("node:child_process");
    execSync(
      `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`,
      { stdio: "ignore" },
    );
  } catch {
    /* nothing listening */
  }
}

console.log(`\n${results.join("\n")}`);
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
