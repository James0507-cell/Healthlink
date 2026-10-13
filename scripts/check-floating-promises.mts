/**
 * Find floating promises: calls to now-async functions used as a bare statement.
 *
 * TypeScript reports a missing `await` only when the RESULT is used. A call whose
 * result is discarded compiles cleanly while doing nothing useful — the work is
 * scheduled but nobody waits for it, and the enclosing function returns first.
 * That is the one class of error the compiler cannot catch here, so it is checked
 * explicitly.
 *
 * A statement is flagged when it is exactly `name(...)` or `receiver.name(...)`
 * followed by `;`, with no `await`, no assignment, no `return`, and `name` is one
 * of the functions that became async.
 */
import { readFileSync } from "node:fs";
import ts from "typescript";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Functions that are now async and must therefore be awaited. */
const ASYNC_FNS = new Set([
  // db.ts
  "all", "get", "run", "exec", "insert", "update", "migrate",
  "getSetting", "setSetting", "writeAudit", "verifyAuditChain", "closeDb",
  // seed.ts
  "seed", "resetAndSeed",
  // auth.ts
  "createSession", "destroySession", "getSession", "requireSession",
  "requirePageSession", "requirePageAccess", "activeSessions", "guard", "auditFor",
  // referrals.ts
  "listReferrals", "referralCounts", "getReferralDetail", "actorToUserRow",
  "trackReferral", "listConsents", "dashboardStats", "listPatients",
  "listFacilities", "listUsers", "createReferral", "transitionReferral",
  "addAttachment", "updateDraft", "revokeConsent",
  // fhir-store.ts
  "persistReferralBundle", "storeSummary", "storedReferences",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

const findings: string[] = [];

for (const file of [...walk("src"), ...walk("scripts")]) {
  // Tests and verification scripts are deliberate about ordering; only app code
  // is held to this rule, since a dropped await there is a real defect.
  if (file.includes("test-fhir") || file.includes("verify-")) continue;

  const src = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  const visit = (node: ts.Node): void => {
    if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
      const call = node.expression;
      let name: string | null = null;
      let isMethodOnHandle = false;

      if (ts.isIdentifier(call.expression)) {
        name = call.expression.text;
      } else if (ts.isPropertyAccessExpression(call.expression)) {
        name = call.expression.name.text;
        // `handle.exec(...)` is the synchronous SQLite driver method, not the
        // async module-level `exec`. Receivers ending in "handle" or naming the
        // sqlite accessor are the driver itself, so they are not awaited.
        const receiver = call.expression.expression.getText(sf);
        if (/handle|sqlite\(\)$/.test(receiver)) isMethodOnHandle = true;
      }

      if (name && ASYNC_FNS.has(name) && !isMethodOnHandle) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        findings.push(`${file}:${line}  ${node.getText(sf).slice(0, 100)}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

if (findings.length === 0) {
  console.log("No floating promises found.");
} else {
  console.log(`Found ${findings.length} call(s) whose result is discarded:\n`);
  for (const f of findings) console.log("  " + f);
  console.log("\nEach needs `await` (or a deliberate `void`, with a comment).");
}
