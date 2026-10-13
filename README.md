# HealthLink

An interoperable patient referral and health information exchange system for selected
healthcare facilities in Davao City.

HealthLink is a **middleware and coordination layer**. It connects to the systems a facility
already runs rather than replacing them. It standardises what a referral must carry, validates
that information against HL7 FHIR R4, routes it to the receiving facility, tracks it through to
completion, and returns clinical feedback to the referring provider — a closed loop.

This repository is a **concept prototype** built for the study *HealthLink: An Interoperable
Patient Referral and Health Information Exchange System*. It exists to evaluate a design, not to
demonstrate a deployed system. It contains synthetic data only.

---

## Running it

```bash
npm install
npm run db:reset     # create the database and load synthetic demo data
npm run dev          # http://localhost:3000
```

Requires Node.js 20.9 or newer.

HealthLink runs on **either SQLite or PostgreSQL**, chosen by `DATABASE_URL`:

| `DATABASE_URL` | Backend | Use for |
| --- | --- | --- |
| unset | SQLite (`node:sqlite`, file at `data/healthlink.db`) | local development and offline evaluation — no database server to install |
| `postgres://…` | PostgreSQL | hosted deployment, where the filesystem is read-only |

SQLite needs no native compilation. To use Postgres, put the connection string in `.env.local`
(which is git-ignored) or export it:

```bash
DATABASE_URL=postgresql://…   # pooled connection string
HEALTHLINK_SECRET=…           # session signing key; required in any real deployment
```

Then run the same commands. `npm run db:reset` targets whichever backend is configured, so it seeds
the Postgres database when `DATABASE_URL` is set.

### Demo accounts

All accounts share the password `HealthLink!2026`. The sign-in screen lists them with a picker.

| Role | Email | Facility |
| --- | --- | --- |
| Physician | `physician@buhangin.example.ph` | Buhangin District Health Center (referring) |
| Nurse | `nurse@buhangin.example.ph` | Buhangin District Health Center (referring) |
| Referral coordinator | `coordinator@buhangin.example.ph` | Buhangin District Health Center (referring) |
| Physician | `physician@agdao.example.ph` | Agdao Community Health Center (referring) |
| Physician | `physician@talomo.example.ph` | Talomo Family Care Clinic (referring) |
| Specialist | `specialist@synapse.example.ph` | Synapse Regional Medical Center (receiving) |
| Specialist | `specialist@dmgmc.example.ph` | Davao Metro Government Medical Center (receiving) |
| HIE administrator | `admin@healthlink.example.ph` | Network-wide |
| Privacy auditor | `auditor@healthlink.example.ph` | Network-wide, read-only |

### Walking the closed loop

1. **Referring** — sign in as `physician@buhangin.example.ph`, open a referral, review its clinical
   summary and FHIR validation, then route it.
2. **Receiving** — sign in as `specialist@dmgmc.example.ph`, acknowledge receipt, begin review, then
   accept, recording an outcome and returned feedback.
3. **Referring** — sign back in and acknowledge the feedback to close the loop.
4. **Oversight** — sign in as `auditor@healthlink.example.ph`, verify the audit hash chain and
   export it.

---

## What it does

| Capability | Where it lives |
| --- | --- |
| Referral creation with clinical summary | `/referrals/new` (six-step wizard), `/referrals/[id]` |
| FHIR mapping and validation | `src/lib/fhir/`, `/interop/validate`, `/interop/alignment` |
| Secure routing / interoperability | `/fhir/...` facade, `/interop/capability` |
| Closed-loop status tracking | `src/lib/workflow.ts` (13 states), referral history |
| Feedback and communication | Referral feedback thread, mapped to FHIR `Communication` |
| Consent, access and audit | `/consent`, `/audit`, RBAC in `src/lib/auth.ts` |
| Privacy and data governance | `/governance`, retention policy, data minimisation |

---

## Architecture

```
src/
  app/
    (app)/            authenticated application shell and pages
    (print)/          chrome-free printable documents
    api/              bundle download, attachment retrieval, audit CSV, search
    fhir/[...path]/   read-only FHIR R4 facade
    login/  track/    public routes (sign-in, patient status lookup)
  components/         presentational components and client islands
  lib/
    db.ts             schema, dialect-aware queries, hash-chained audit trail
    dialect.ts        SQLite/Postgres translation (placeholders, casts, helpers)
    auth.ts           roles (9), permissions (34), facility scoping, consent gate
    workflow.ts       referral state machine mapped onto FHIR Task
    referrals.ts      service layer: the only path that mutates a referral
    seed.ts           synthetic Davao City demonstration dataset
    fhir/
      types.ts        FHIR R4 subset used by HealthLink
      terminology.ts  code systems, identifier systems, terminology subsets
      profiles.ts     Draft PH Core profile constraints (v0.2.0)
      validator.ts    FHIR R4 + PH Core validation to OperationOutcome
      mapper.ts       HealthLink data -> FHIR transaction Bundle
      audit-mapper.ts HealthLink audit events -> FHIR AuditEvent
    fhir-store.ts     materialised FHIR resource store behind the facade
```

### Design decisions worth knowing

**The FHIR facade is deliberately read-only.** Referrals are written only through the application
service layer, so consent, validation and attribution cannot be bypassed by a direct FHIR write. A
client attempting a write receives HTTP 405 with an `OperationOutcome` explaining why.

**Referral state lives in one place.** `transitionReferral()` in `src/lib/referrals.ts` is the only
function that changes referral state. It enforces, in order: authentication, role permission,
facility scoping, the consent gate, action-specific required fields, and pre-routing validation —
then appends to the referral history and the audit trail. Every UI action routes through it.

**Validation distinguishes errors from warnings.** Errors block routing. Warnings do not, because the
national terminology value sets are still in draft and rejecting a genuinely valid code would block
patient care. Warnings are surfaced for review instead.

**The audit trail is hash-chained.** Each record stores a SHA-256 hash over its own content plus the
previous record's hash, so tampering is detectable. `writeAudit` and `verifyAuditChain` share one
canonical serialisation function so the fields written and the fields verified cannot drift apart.

Ordering is by an explicit `seq` column, not by timestamp. Two audit events written in the same
millisecond — which happens whenever one request records both a workflow event and an audit row —
would otherwise have no definite order, and the chain would report a false break. SQLite offered
`rowid` as a tiebreaker; Postgres has no such column, so the order is stored explicitly and the
chain verifies identically on both backends.

**Inline vitals are promoted to FHIR Observations.** Vitals are captured as columns (natural for a
form) but exchanged as LOINC-coded `Observation` resources, including a derived BMI. A receiving
system reads structured data rather than parsing narrative text.

---

## Alignment to the Draft Philippine Core FHIR IG

HealthLink validates against the **Draft Philippine Core FHIR Implementation Guide v0.2.0**
(`fhir.ph.core#0.2.0`, FHIR R4 4.0.1), published by UP Manila National TeleHealth Center under the
guidance of the Department of Health.

That guide is a draft and its own documentation states it is not yet available for production use.
HealthLink therefore treats it as an **alignment reference** rather than a finalized requirement:

- Where the guide publishes a profile, HealthLink validates against it — including tightened
  cardinality, must-support elements, terminology bindings and invariants such as `provenance-1`.
- Where no profile exists (`DocumentReference`, `Consent`, `Communication`, `AuditEvent`), the
  resource is mapped to the FHIR R4 base and the gap is recorded on `/interop/alignment` rather than
  hidden.

Identifier systems, extension URLs and canonical profile URLs are taken verbatim from the published
package. HealthLink-local systems are namespaced under `healthlink.davao.gov.ph` so they cannot be
mistaken for national standards.

---

## Tests

```bash
npm test                  # 111 checks: FHIR validation, mapping, workflow, audit chain
npm run test:postgres     # the same 111 checks against PostgreSQL
npm run terminology:check # terminology subset coverage against referral reasons
npm run typecheck         # TypeScript
```

`npm test` uses its own SQLite file (`data/healthlink-test.db`), so a test run can never contaminate
the demonstration dataset.

`npm run test:postgres` runs the identical suite against Postgres. It is a separate command with an
explicit opt-in (`HEALTHLINK_TEST_POSTGRES=1`) because the suite deletes and re-seeds every table,
and it targets a dedicated `healthlink_test` database rather than the demo one. Running the same
assertions on both backends is what proves the dialect port is faithful — including the audit hash
chain, which must verify identically on each.

Two further verification scripts exist for deployment checks:

```bash
npm run verify:postgres   # schema, seed, hash chain, tamper detection, report arithmetic
npm run verify:http       # starts the production server and exercises the real HTTP surface
```

The test suite covers the FHIR layer end to end: validation of seeded and runtime-created referrals,
PH Core cardinality and invariants, terminology behaviour, the workflow state machine, bundle
referential integrity, audit-chain tamper detection, and a full live referral lifecycle (create →
validate → route → transition).

---

## Scope and limitations

This is a concept prototype. It is **not** a production system and makes no claim of certified
interoperability or demonstrated clinical benefit.

**Deliberately included:** structured referral creation, FHIR R4 mapping validated against the draft
PH Core profiles, a read-only FHIR facade with a capability statement, a 13-state closed loop mapped
to FHIR `Task`, two-way feedback, nine roles with 34 permissions, consent with working revocation, a
hash-chained audit trail, and process reporting.

**Outside its scope:** conformance testing against an external FHIR validator, penetration testing,
live integration with a facility EMR, binary document handling (PDF, DICOM) with malware scanning,
full national terminology server integration, and any measurement of clinical outcomes.

**Data:** every patient, provider and facility record is synthetic. Facility names are fictional
composites. Davao City geographic codes (PSGC) are real public codes so that address mapping is
exercised correctly. Referral figures illustrate the reporting capability; they are not findings
about referral practice in Davao City.

### Where the demo data lives

The database is **not committed**. It is generated from `src/lib/seed.ts`, which is committed.
A clone therefore starts with no data until you seed it:

```bash
npm run db:reset        # builds the database from the seeder (either backend)
npm run db:reset:sqlite # forces SQLite even when DATABASE_URL is set
npm run demo:data       # what the seeder defines (counts and codes)
npm run demo:state      # what a built database contains, with referral numbers and tracking codes
```

The seeder defines 6 facilities, 18 staff accounts, 8 patients and 6 referral scenarios spanning the
workflow, plus 39 hash-chained audit events. Referral numbers and tracking codes are deterministic,
so the values quoted in `docs/EVALUATION-SCENARIO.md` stay valid across reseeds.

This arrangement keeps the repository small and reviewable: a reader can see exactly what synthetic
data the prototype uses by reading one file, rather than inferring it from a binary database.

### Deploying it

HealthLink runs on serverless hosting, but **only with a Postgres `DATABASE_URL`**. Serverless
functions have a read-only filesystem except for an ephemeral `/tmp`, so the SQLite file cannot be
used there — with no `DATABASE_URL` the deployed app would fail on its first write.

On Vercel:

1. Push the repository and import it as a project. The Next.js defaults need no changes.
2. Create a Postgres database (Neon and Vercel Postgres both work) and copy its **pooled** connection
   string.
3. Set two environment variables in the project settings:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | the pooled Postgres connection string |
   | `HEALTHLINK_SECRET` | a fresh random value, e.g. `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |

4. Seed the database once, from a machine that can reach it:

   ```bash
   DATABASE_URL=postgresql://… npm run db:reset
   ```

`HEALTHLINK_SECRET` must be set. Without it the app falls back to the development default that is
published in this repository, and session cookies could be forged.

Region choice matters more than it looks: keep the database and the functions in the same region.
A serverless function in one region querying a database on another continent turns every page render
into a series of cross-ocean round trips. On Neon's free tier, note that a suspended database adds a
cold-start delay to the first request after a period of inactivity.

### Sharing it with a reviewer

The prototype has no built-in access control above the application login, and the sign-in screen
lists the demo accounts — which is exactly what you want for an evaluation session, and not what you
want on an open URL. If the deployment will be publicly reachable for any length of time, put a
password gate in front of it (for example Vercel's own password protection, or a hosting-level
basic-auth rule) and treat the demo accounts as *inside* that perimeter.

---

## Privacy

Health information is sensitive personal information under the **Data Privacy Act of 2012
(RA 10173)**. HealthLink records the lawful basis for each exchange, enforces least-privilege
facility-scoped access, and audits significant actions including refusals. The audit CSV export
pseudonymises patient identifiers and omits patient names.

The prototype's own data is synthetic, in line with the study's ethics commitments: no real patient
records were used for development or testing.
