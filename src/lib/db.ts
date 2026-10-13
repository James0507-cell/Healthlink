/**
 * HealthLink persistence layer.
 *
 * Uses the Node.js built-in SQLite driver (`node:sqlite`), so the prototype
 * needs no native compilation and no external database server. The database is
 * a single file under /data and is seeded with synthetic data only.
 *
 * Privacy design notes (RA 10173 alignment):
 *  - Passwords are stored as scrypt hashes with a per-user salt.
 *  - Audit events are append-only: writeAudit() never updates or deletes.
 *  - Attachment binaries are stored as received and can be purged by the
 *    retention sweep (see /api/admin/retention).
 */

import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID, randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";

export const DATA_DIR = join(process.cwd(), "data");

/**
 * Resolve the database file path.
 *
 * Deliberately a function, not a module-level constant. Module-level capture
 * happens when `db.ts` is first imported, and ESM hoists imports above any
 * statement in the importing file — so a test that sets `HEALTHLINK_DB` at the
 * top of its own file would still be too late. Reading the environment at call
 * time makes the override reliable.
 */
export function dbPath(): string {
  return process.env.HEALTHLINK_DB ?? join(DATA_DIR, "healthlink.db");
}

let _db: DatabaseSync | null = null;

/** Open (once) and return the shared database handle. */
export function db(): DatabaseSync {
  if (_db) return _db;
  const path = dbPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  _db = new DatabaseSync(path);
  _db.exec("PRAGMA journal_mode = WAL");
  _db.exec("PRAGMA foreign_keys = ON");
  return _db;
}

/** Close the shared handle (used by scripts). */
export function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

/* ------------------------------------------------------------------ */
/* Schema                                                              */
/* ------------------------------------------------------------------ */

export const SCHEMA_SQL = `
-- ------------------------------------------------------------------
-- Reference / directory data
-- ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS facilities (
  id                     TEXT PRIMARY KEY,
  nhfr_code              TEXT,                 -- PH Core: DOH NHFR Health Facility Code
  hcpn_code              TEXT,                 -- PH Core: Health Care Provider Network code
  philhealth_pan         TEXT,                 -- PH Core: PhilHealth Accreditation Number
  philhealth_pen         TEXT,                 -- PH Core: PhilHealth Employer Number
  name                   TEXT NOT NULL,
  short_name             TEXT,
  org_type_code          TEXT,                 -- Organization.type coding code
  org_type_display       TEXT,
  level                  TEXT,                 -- primary | secondary | tertiary | specialized | diagnostic
  ownership              TEXT,                 -- public | private
  region_code            TEXT,
  region_display         TEXT,
  province_code          TEXT,
  province_display       TEXT,
  city_code              TEXT,
  city_display           TEXT,
  barangay_code          TEXT,
  barangay_display       TEXT,
  address_line           TEXT,
  postal_code            TEXT,
  phone                  TEXT,
  email                  TEXT,
  is_referring           INTEGER NOT NULL DEFAULT 1,
  is_receiving           INTEGER NOT NULL DEFAULT 1,
  service_capabilities   TEXT,                 -- JSON array of service codes/labels
  fhir_endpoint          TEXT,                 -- base URL of the facility FHIR facade
  active                 INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY,
  email             TEXT NOT NULL UNIQUE,
  password_salt     TEXT NOT NULL,
  password_hash     TEXT NOT NULL,
  full_name         TEXT NOT NULL,
  family_name       TEXT,
  given_name        TEXT,
  prefix            TEXT,
  role              TEXT NOT NULL,             -- see ROLES in auth.ts
  facility_id       TEXT REFERENCES facilities(id),
  prc_license       TEXT,
  specialization    TEXT,
  phone             TEXT,
  active            INTEGER NOT NULL DEFAULT 1,
  mfa_enabled       INTEGER NOT NULL DEFAULT 0,
  last_login_at     TEXT,
  failed_logins     INTEGER NOT NULL DEFAULT 0,
  locked_until      TEXT,
  created_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS patients (
  id                 TEXT PRIMARY KEY,
  local_mrn          TEXT,
  philhealth_id      TEXT,                     -- PH Core: PhilHealth Identification Number
  philsys_id         TEXT,                     -- PH Core: PhilSys national ID
  family_name        TEXT NOT NULL,
  given_name         TEXT NOT NULL,
  middle_name        TEXT,
  suffix             TEXT,
  sex                TEXT NOT NULL,            -- male | female | other | unknown
  birth_date         TEXT NOT NULL,
  civil_status       TEXT,
  blood_type         TEXT,
  region_code        TEXT,
  region_display     TEXT,
  province_code      TEXT,
  province_display   TEXT,
  city_code          TEXT,
  city_display       TEXT,
  barangay_code      TEXT,
  barangay_display   TEXT,
  address_line       TEXT,
  postal_code        TEXT,
  phone              TEXT,
  email              TEXT,
  occupation         TEXT,
  nationality        TEXT,
  religion           TEXT,
  is_pwd             INTEGER NOT NULL DEFAULT 0,
  pwd_id             TEXT,
  created_by_user    TEXT REFERENCES users(id),
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  merged_into        TEXT REFERENCES patients(id)
);

-- ------------------------------------------------------------------
-- Consent / lawful basis (RA 10173)
-- ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS consents (
  id                  TEXT PRIMARY KEY,
  patient_id          TEXT NOT NULL REFERENCES patients(id),
  referral_id         TEXT,
  purpose_code        TEXT NOT NULL,           -- from LAWFUL_BASIS
  purpose_display     TEXT NOT NULL,
  legal_reference     TEXT,
  scope_facilities    TEXT,                    -- JSON array of facility ids
  scope_data_classes  TEXT,                    -- JSON array of data class codes
  period_start        TEXT,
  period_end          TEXT,
  status              TEXT NOT NULL,           -- proposed | active | rejected | expired | revoked
  granted_by_name     TEXT,
  granted_by_relation TEXT,                    -- self | spouse | parent | guardian | attorney-in-fact
  granted_at          TEXT,
  revoked_at          TEXT,
  revoke_reason       TEXT,
  witness_name        TEXT,
  fhir_consent_id     TEXT,
  created_at          TEXT NOT NULL
);

-- ------------------------------------------------------------------
-- Referrals (the closed-loop workflow)
-- ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS referrals (
  id                      TEXT PRIMARY KEY,
  referral_number         TEXT NOT NULL UNIQUE,
  tracking_code           TEXT NOT NULL UNIQUE,  -- patient-visible status code
  patient_id              TEXT NOT NULL REFERENCES patients(id),
  referring_facility_id   TEXT NOT NULL REFERENCES facilities(id),
  referring_user_id       TEXT REFERENCES users(id),
  receiving_facility_id   TEXT NOT NULL REFERENCES facilities(id),
  receiving_user_id       TEXT REFERENCES users(id),

  status                  TEXT NOT NULL,          -- see WORKFLOW_STATES in workflow.ts
  status_updated_at       TEXT NOT NULL,
  priority                TEXT NOT NULL,          -- routine | urgent | asap | stat
  reason_code             TEXT NOT NULL,
  reason_display          TEXT NOT NULL,
  reason_narrative        TEXT,

  -- clinical summary
  chief_complaint         TEXT,
  history_of_present      TEXT,
  past_medical_history    TEXT,
  past_surgical_history   TEXT,
  family_history          TEXT,
  personal_social_history TEXT,
  review_of_systems       TEXT,
  physical_examination    TEXT,
  assessment              TEXT,
  management_plan         TEXT,
  requested_action        TEXT,
  special_instructions    TEXT,

  -- vitals captured at referral time
  vital_systolic          REAL,
  vital_diastolic         REAL,
  vital_heart_rate        REAL,
  vital_resp_rate         REAL,
  vital_temperature       REAL,
  vital_spo2              REAL,
  vital_weight_kg         REAL,
  vital_height_cm         REAL,
  vital_pain_score        INTEGER,

  -- consent / privacy
  consent_id              TEXT REFERENCES consents(id),
  lawful_basis_code       TEXT NOT NULL,
  lawful_basis_display    TEXT NOT NULL,
  data_minimisation_note  TEXT,
  confidentiality_level   TEXT NOT NULL DEFAULT 'normal', -- normal | restricted | highly-restricted

  -- receiving-side outcome
  outcome_code            TEXT,
  outcome_display         TEXT,
  receiving_notes         TEXT,
  appointment_at          TEXT,
  accepted_at             TEXT,
  completed_at            TEXT,
  closed_at               TEXT,

  -- FHIR linkage
  fhir_service_request_id TEXT,
  fhir_task_id            TEXT,
  fhir_encounter_id       TEXT,
  fhir_bundle_id          TEXT,
  fhir_bundle_version     INTEGER NOT NULL DEFAULT 0,
  fhir_patient_id         TEXT,
  fhir_validation_errors  INTEGER NOT NULL DEFAULT 0,
  fhir_validation_warnings INTEGER NOT NULL DEFAULT 0,

  -- transport
  routed_at               TEXT,
  route_attempts          INTEGER NOT NULL DEFAULT 0,
  route_channel           TEXT,                 -- shared-fhir-api | manual | fallback-fax

  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL,
  deleted_at              TEXT,
  retention_until         TEXT
);

CREATE TABLE IF NOT EXISTS referral_diagnoses (
  id           TEXT PRIMARY KEY,
  referral_id  TEXT NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  system       TEXT NOT NULL,
  code         TEXT NOT NULL,
  display      TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'secondary',  -- primary | secondary | differential
  onset_date   TEXT,
  certainty    TEXT,
  sequence     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS referral_observations (
  id            TEXT PRIMARY KEY,
  referral_id   TEXT NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  system        TEXT NOT NULL,
  code          TEXT NOT NULL,
  display       TEXT NOT NULL,
  category      TEXT NOT NULL,
  value_num     REAL,
  value_text    TEXT,
  unit          TEXT,
  ucum_code     TEXT,
  interpretation TEXT,
  ref_low       REAL,
  ref_high      REAL,
  effective_at  TEXT,
  sequence      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS referral_medications (
  id             TEXT PRIMARY KEY,
  referral_id    TEXT NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  medication     TEXT NOT NULL,
  fda_cpr        TEXT,
  dose           TEXT,
  route          TEXT,
  frequency      TEXT,
  status         TEXT NOT NULL DEFAULT 'active',
  started_on     TEXT,
  sequence       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS referral_allergies (
  id            TEXT PRIMARY KEY,
  referral_id   TEXT NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  system        TEXT NOT NULL,
  code          TEXT NOT NULL,
  display       TEXT NOT NULL,
  reaction      TEXT,
  criticality   TEXT,
  category      TEXT,
  sequence      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS referral_attachments (
  id             TEXT PRIMARY KEY,
  referral_id    TEXT NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  doc_type_code  TEXT NOT NULL,
  doc_type_display TEXT NOT NULL,
  content_type   TEXT NOT NULL,
  size_bytes     INTEGER NOT NULL DEFAULT 0,
  content_b64    TEXT,
  content_text   TEXT,
  author_user_id TEXT REFERENCES users(id),
  created_at     TEXT NOT NULL,
  sha256         TEXT,
  fhir_docref_id TEXT,
  retention_until TEXT
);

-- Closed-loop timeline: every state transition and action, append-only.
CREATE TABLE IF NOT EXISTS referral_events (
  id              TEXT PRIMARY KEY,
  referral_id     TEXT NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  sequence        INTEGER NOT NULL,
  from_status     TEXT,
  to_status       TEXT NOT NULL,
  action          TEXT NOT NULL,
  fhir_task_status TEXT,
  business_status TEXT,
  actor_user_id   TEXT REFERENCES users(id),
  actor_name      TEXT,
  actor_role      TEXT,
  actor_facility  TEXT,
  note            TEXT,
  created_at      TEXT NOT NULL,
  fhir_task_version INTEGER
);

CREATE TABLE IF NOT EXISTS referral_messages (
  id               TEXT PRIMARY KEY,
  referral_id      TEXT NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL,             -- feedback | query | update | acknowledgment
  subject          TEXT,
  body             TEXT NOT NULL,
  sender_user_id   TEXT REFERENCES users(id),
  sender_name      TEXT,
  sender_facility  TEXT,
  recipient_facility TEXT,
  recipient_role   TEXT,
  created_at       TEXT NOT NULL,
  read_at          TEXT,
  fhir_communication_id TEXT,
  attachment_id    TEXT REFERENCES referral_attachments(id)
);

-- ------------------------------------------------------------------
-- FHIR resource store (facade backing store)
-- ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS fhir_resources (
  id                TEXT PRIMARY KEY,
  resource_type     TEXT NOT NULL,
  resource_id       TEXT NOT NULL,
  version_id        INTEGER NOT NULL DEFAULT 1,
  content           TEXT NOT NULL,            -- JSON
  last_updated      TEXT NOT NULL,
  source_facility_id TEXT,
  created_by_user   TEXT REFERENCES users(id),
  referral_id       TEXT,
  UNIQUE (resource_type, resource_id)
);

CREATE INDEX IF NOT EXISTS idx_fhir_resources_type ON fhir_resources(resource_type);
CREATE INDEX IF NOT EXISTS idx_fhir_resources_referral ON fhir_resources(referral_id);

-- ------------------------------------------------------------------
-- Audit trail (append-only)
-- ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_events (
  id             TEXT PRIMARY KEY,
  occurred_at    TEXT NOT NULL,
  action         TEXT NOT NULL,               -- C | R | U | D | E
  event_type     TEXT NOT NULL,
  event_subtype  TEXT,
  actor_user_id  TEXT,
  actor_name     TEXT,
  actor_role     TEXT,
  actor_facility TEXT,
  patient_id     TEXT,
  referral_id    TEXT,
  entity_type    TEXT,
  entity_id      TEXT,
  outcome        TEXT NOT NULL DEFAULT '0',   -- AuditEvent.outcome
  outcome_desc   TEXT,
  purpose_code   TEXT,
  description    TEXT NOT NULL,
  ip_address     TEXT,
  user_agent     TEXT,
  network_type   TEXT,
  fhir_audit_id  TEXT,
  previous_hash  TEXT,
  record_hash    TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_occurred ON audit_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_referral ON audit_events(referral_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_events(actor_user_id);

CREATE TABLE IF NOT EXISTS access_requests (
  id             TEXT PRIMARY KEY,
  referral_id    TEXT REFERENCES referrals(id),
  patient_id     TEXT REFERENCES patients(id),
  requestor_user TEXT REFERENCES users(id),
  requestor_facility TEXT REFERENCES facilities(id),
  requested_scope TEXT,
  reason         TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending',
  decided_by     TEXT REFERENCES users(id),
  decided_at     TEXT,
  decision_note  TEXT,
  created_at     TEXT NOT NULL,
  expires_at     TEXT
);

CREATE TABLE IF NOT EXISTS system_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  updated_by  TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  ip_address   TEXT,
  user_agent   TEXT,
  revoked_at   TEXT
);

-- API tokens for facility system integration. Only the SHA-256 hash of the
-- token is stored, so a database read cannot recover a usable credential.
CREATE TABLE IF NOT EXISTS api_tokens (
  id            TEXT PRIMARY KEY,
  label         TEXT NOT NULL,
  token_hash    TEXT NOT NULL UNIQUE,
  token_prefix  TEXT NOT NULL,            -- first characters, shown in the UI for identification
  user_id       TEXT NOT NULL REFERENCES users(id),
  facility_id   TEXT REFERENCES facilities(id),
  scopes        TEXT,                     -- JSON array of permitted resource types
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  last_used_at  TEXT,
  revoked_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_hash ON api_tokens(token_hash);

CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);
CREATE INDEX IF NOT EXISTS idx_referrals_receiving ON referrals(receiving_facility_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referring ON referrals(referring_facility_id);
CREATE INDEX IF NOT EXISTS idx_referrals_patient ON referrals(patient_id);
CREATE INDEX IF NOT EXISTS idx_referral_events_referral ON referral_events(referral_id, sequence);
CREATE INDEX IF NOT EXISTS idx_messages_referral ON referral_messages(referral_id);
CREATE INDEX IF NOT EXISTS idx_consents_patient ON consents(patient_id);
`;

/** Create all tables if they do not exist. Safe to call repeatedly. */
export function migrate() {
  db().exec(SCHEMA_SQL);
}

/* ------------------------------------------------------------------ */
/* Query helpers                                                       */
/* ------------------------------------------------------------------ */

type Row = Record<string, unknown>;

export function all<T = Row>(sql: string, ...params: unknown[]): T[] {
  const stmt = db().prepare(sql);
  return stmt.all(...(params as never[])) as T[];
}

export function get<T = Row>(sql: string, ...params: unknown[]): T | undefined {
  const stmt = db().prepare(sql);
  return stmt.get(...(params as never[])) as T | undefined;
}

export function run(sql: string, ...params: unknown[]) {
  const stmt = db().prepare(sql);
  return stmt.run(...(params as never[]));
}

export function exec(sql: string) {
  db().exec(sql);
}

/**
 * Insert a row from a plain object. Column names come from the object keys, so
 * placeholders can never drift out of step with the column list.
 */
export function insert(table: string, record: Record<string, unknown>): void {
  const cols = Object.keys(record);
  const placeholders = cols.map(() => "?").join(",");
  const sql = `INSERT INTO ${table} (${cols.join(",")}) VALUES (${placeholders})`;
  db().prepare(sql).run(...(cols.map((c) => normalizeValue(record[c])) as never[]));
}

/** Update a row by primary key, from a plain object of changed columns. */
export function update(table: string, idColumn: string, idValue: unknown, record: Record<string, unknown>): void {
  const cols = Object.keys(record);
  if (!cols.length) return;
  const sql = `UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE ${idColumn} = ?`;
  db()
    .prepare(sql)
    .run(...(cols.map((c) => normalizeValue(record[c])) as never[]), idValue as never);
}

/** SQLite only accepts null/number/bigint/string/Uint8Array. Coerce booleans. */
function normalizeValue(v: unknown): unknown {
  if (v === undefined || v === null) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  return v;
}

/* ------------------------------------------------------------------ */
/* Password hashing (scrypt, no external dependency)                   */
/* ------------------------------------------------------------------ */

const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string, salt?: string): { salt: string; hash: string } {
  const s = salt ?? randomBytes(16).toString("hex");
  const derived = scryptSync(password, s, SCRYPT_KEYLEN).toString("hex");
  return { salt: s, hash: derived };
}

export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(expectedHash, "hex");
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

export function newId(prefix = ""): string {
  return prefix ? `${prefix}-${randomUUID()}` : randomUUID();
}

/** Deterministic short code for patient-visible referral tracking. */
export function trackingCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(10);
  let out = "";
  for (let i = 0; i < 10; i++) out += alphabet[bytes[i] % alphabet.length];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

export function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

/* ------------------------------------------------------------------ */
/* Audit trail                                                         */
/* ------------------------------------------------------------------ */

export interface AuditInput {
  action: "C" | "R" | "U" | "D" | "E";
  eventType: string;
  eventSubtype?: string;
  actorUserId?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  actorFacility?: string | null;
  patientId?: string | null;
  referralId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  outcome?: "0" | "4" | "8" | "12";
  outcomeDesc?: string | null;
  purposeCode?: string | null;
  description: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  networkType?: string | null;
  /**
   * Override the event time. Used only by the seeder to place synthetic history
   * in the past. Live code must never set this: the timestamp is part of what
   * makes the audit record trustworthy.
   */
  occurredAt?: string;
}

/** The exact field set covered by the audit hash. Order is significant. */
interface AuditableRecord {
  id: string;
  occurred_at: string;
  action: string;
  event_type: string;
  actor_user_id: string | null;
  actor_facility: string | null;
  referral_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  outcome: string;
  description: string;
  previous_hash: string | null;
  /** Present on rows read back from the table; not part of the hashed input. */
  record_hash?: string | null;
}

/**
 * Canonical serialisation of an audit record for hashing.
 *
 * Single source of truth: `writeAudit` and `verifyAuditChain` both call this, so
 * the fields written and the fields verified can never drift apart. Array order
 * is the schema, so appending a field is a breaking change that invalidates
 * existing chains and must be treated as a migration.
 */
export function auditHashInput(row: AuditableRecord): string {
  return JSON.stringify([
    row.id,
    row.occurred_at,
    row.action,
    row.event_type,
    row.actor_user_id,
    row.actor_facility,
    row.referral_id,
    row.entity_type,
    row.entity_id,
    row.outcome,
    row.description,
    row.previous_hash,
  ]);
}

/**
 * Append an audit event. The table is hash-chained: each record stores the hash
 * of the previous record, so tampering or deletion is detectable.
 */
export function writeAudit(input: AuditInput): string {
  const id = newId("aud");
  const occurredAt = input.occurredAt ?? new Date().toISOString();

  // For back-dated seeding, chain onto the record that precedes this moment in
  // time rather than onto whatever was inserted last.
  const prev = input.occurredAt
    ? get<{ record_hash: string | null }>(
        "SELECT record_hash FROM audit_events WHERE occurred_at <= ? ORDER BY occurred_at DESC, rowid DESC LIMIT 1",
        input.occurredAt,
      )
    : get<{ record_hash: string | null }>(
        "SELECT record_hash FROM audit_events ORDER BY occurred_at DESC, rowid DESC LIMIT 1",
      );
  const previousHash = prev?.record_hash ?? null;

  const row: AuditableRecord = {
    id,
    occurred_at: occurredAt,
    action: input.action,
    event_type: input.eventType,
    actor_user_id: input.actorUserId ?? null,
    actor_facility: input.actorFacility ?? null,
    referral_id: input.referralId ?? null,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    outcome: input.outcome ?? "0",
    description: input.description,
    previous_hash: previousHash,
  };
  const recordHash = sha256(auditHashInput(row));

  run(
    `INSERT INTO audit_events (
       id, occurred_at, action, event_type, event_subtype,
       actor_user_id, actor_name, actor_role, actor_facility,
       patient_id, referral_id, entity_type, entity_id,
       outcome, outcome_desc, purpose_code, description,
       ip_address, user_agent, network_type, fhir_audit_id,
       previous_hash, record_hash
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    row.id,
    row.occurred_at,
    row.action,
    row.event_type,
    input.eventSubtype ?? null,
    row.actor_user_id,
    input.actorName ?? null,
    input.actorRole ?? null,
    row.actor_facility,
    input.patientId ?? null,
    row.referral_id,
    row.entity_type,
    row.entity_id,
    row.outcome,
    input.outcomeDesc ?? null,
    input.purposeCode ?? null,
    row.description,
    input.ipAddress ?? null,
    input.userAgent ?? null,
    input.networkType ?? null,
    null,
    row.previous_hash,
    recordHash,
  );

  return id;
}

/** Verify the audit hash chain. Returns the first record where it breaks. */
export function verifyAuditChain(): {
  intact: boolean;
  checked: number;
  brokenAt: string | null;
  reason?: string;
} {
  const rows = all<AuditableRecord & { occurred_at: string }>(
    "SELECT * FROM audit_events ORDER BY occurred_at ASC, rowid ASC",
  );

  let prev: string | null = null;
  for (const r of rows) {
    const expected = sha256(auditHashInput(r));
    if (expected !== r.record_hash) {
      return {
        intact: false,
        checked: rows.length,
        brokenAt: r.id,
        reason: `record hash mismatch on ${r.event_type} at ${r.occurred_at}`,
      };
    }
    if ((r.previous_hash ?? null) !== prev) {
      return {
        intact: false,
        checked: rows.length,
        brokenAt: r.id,
        reason: `chain link mismatch on ${r.event_type} at ${r.occurred_at}`,
      };
    }
    prev = r.record_hash;
  }
  return { intact: true, checked: rows.length, brokenAt: null };
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export function getSetting(key: string, fallback: string): string {
  const row = get<{ value: string }>("SELECT value FROM system_settings WHERE key = ?", key);
  return row?.value ?? fallback;
}

export function setSetting(key: string, value: string, updatedBy?: string) {
  run(
    `INSERT INTO system_settings (key, value, updated_at, updated_by)
     VALUES (?,?,?,?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value,
       updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    key,
    value,
    new Date().toISOString(),
    updatedBy ?? null,
  );
}
