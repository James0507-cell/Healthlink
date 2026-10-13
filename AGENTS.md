# AGENTS.md

Guidance for AI agents working in this repository.

## What this is

HealthLink — a concept prototype of an interoperable patient referral and health information
exchange system for Davao City, built for a research study. **Not a production system.** All data
is synthetic.

Read `README.md` first. The important framing:

- The **Draft Philippine Core FHIR IG v0.2.0** is treated as an *alignment reference*, never as a
  finalized requirement. Where it publishes a profile, validate against it; where it does not, map
  to the FHIR R4 base and record the gap on `/interop/alignment` rather than hiding it.
- Nothing may claim clinical outcome improvement. Reporting is **process measures only**.
- Health information is sensitive personal information under RA 10173. Consent, least-privilege
  access and auditability are design requirements, not features.

## Commands

```bash
npm run dev               # dev server on :3000
npm run build             # production build (must pass)
npm run typecheck         # tsc --noEmit (must pass, zero errors)
npm test                  # 81 checks across the FHIR, workflow and audit layers
npm run db:reset          # recreate the database and reload synthetic demo data
npm run terminology:check # terminology subset coverage
```

Run `npm run typecheck && npm test` before considering any change complete.

## Architecture rules

**`transitionReferral()` in `src/lib/referrals.ts` is the only function that may change referral
state.** It enforces authentication → role permission → facility scoping → consent gate →
action-specific required fields → pre-routing validation, then appends to the referral history and
the audit trail. Do not mutate referral status anywhere else. If a new UI surface needs to change
state, route it through this function.

**The FHIR facade (`src/app/fhir/[...path]/route.ts`) is read-only by design.** Do not add POST,
PUT, PATCH or DELETE handlers that write. Referrals are written through the service layer so
consent, validation and attribution cannot be bypassed.

**`writeAudit` and `verifyAuditChain` in `src/lib/db.ts` share `auditHashInput()`.** Never compute an
audit hash inline anywhere else — the seeder previously duplicated the payload construction and
silently produced a chain that failed its own verifier. Append a field only as a deliberate
migration, because the array order is part of the on-disk format.

**Pages must use `requirePageSession()` / `requirePageAccess(permission)` from `src/lib/auth.ts`,
never `(await getSession())!`.** The proxy only verifies the JWT; a token can outlive its session
record (revoked, expired, or the database rebuilt). The non-null assertion crashes the page in that
case; the helpers redirect.

**Use `insert()` / `update()` from `src/lib/db.ts` for writes, not hand-written column lists.** A
hand-counted placeholder list previously omitted a column and produced "41 values for 42 columns" at
runtime.

**Use `transitionSide` logic in `canTransition`.** A user whose facility is on both sides of a
referral is treated as whichever side owns the action.

## FHIR layer

- `src/lib/fhir/profiles.ts` transcribes the constrained elements of each PH Core profile:
  tightened cardinality, must-support flags, terminology bindings, target profiles, invariants.
  When updating against a newer IG package, change this file and add a test.
- `src/lib/fhir/validator.ts` enforces FHIR R4 base rules plus those constraints, emitting an
  `OperationOutcome`. Cardinality is evaluated **per parent instance** (`resolveParents`), because a
  nested required element is only required when its parent exists.
- `src/lib/fhir/mapper.ts` maps HealthLink data to a transaction Bundle. Inline vitals are promoted
  to LOINC-coded Observations via `vitalsToObservations()`; `buildReferralBundle` applies that
  promotion once so every consumer sees the same resource set.
- Terminology subsets are deliberately small. **A code outside a subset raises a warning, never an
  error** — rejecting a valid code would block patient care. Only add hard errors for things the FHIR
  specification actually makes mandatory.

## Design system

Visual language: warm neutral canvas (`bg-canvas`), white cards with hairline borders
(`border-ink-200`), one accent colour (brand green, reserved for affirmative and positive states),
restrained semantic colour elsewhere. Buttons are near-black (`btn-primary`) with a green accent
variant (`btn-accent`).

Rules that matter:

- **Status is never conveyed by colour alone.** Every status pill pairs a tint with a dot or glyph and
  a text label (WCAG 1.4.1). Use `<StatusPill>`.
- Utilities are defined in `src/app/globals.css` with `@utility`. Tailwind v4 does not permit
  `@apply`-ing a custom class inside another `@utility`, so compose in JSX instead of nesting.
- Sidebar navigation is deliberately minimal. Reference data, admin surfaces and the four
  interoperability pages are grouped or folded into Settings rather than added as top-level items.
  Adding a sidebar entry is a UX decision, not a technical one.
- Every page states honestly what it does and does not do. Do not remove the limitations sections.

## Data

`src/lib/seed.ts` holds the synthetic dataset: 6 facilities, 18 users, 8 patients, 6 referrals
spanning the workflow, with a hash-chained audit history. Facility names are fictional composites;
PSGC geographic codes are real. If you add a referral scenario, give it a plausible clinical story —
the dataset exists to be read by clinicians during evaluation.

## Environment

`HEALTHLINK_SECRET` — session JWT signing key. Falls back to a development default; required in any
real deployment. See `.env.example`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
