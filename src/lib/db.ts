/**
 * HealthLink persistence layer.
 *
 * Two backends behind one interface, chosen by `DATABASE_URL`:
 *
 *   unset        -> SQLite via the Node.js built-in driver (`node:sqlite`).
 *                   Zero-config, file-based, used for local development and for
 *                   offline evaluation sessions. No native compilation.
 *   postgres://  -> PostgreSQL via `pg`. Required for serverless hosting such as
 *                   Vercel, whose filesystem is read-only.
 *
 * Application SQL is written in SQLite-flavoured syntax and translated for
 * Postgres at execution time by `dialect.ts`. See that module for how the
 * placeholder rewrite works and why it is safe.
 *
 * API SHAPE
 *
 * `all`, `get`, `run`, `exec`, `insert` and `update` return Promises. That is a
 * deliberate, breaking change from the earlier synchronous API: Postgres is
 * asynchronous over the network, and pretending otherwise would have meant
 * either a synchronous driver wrapper or duplicated code paths. Callers must
 * `await`. The TypeScript compiler finds every site.
 *
 * Privacy design notes (RA 10173 alignment):
 *  - Passwords are stored as scrypt hashes with a per-user salt.
 *  - Audit events are append-only: writeAudit() never updates or deletes.
 *  - The audit trail is hash-chained with a monotonic sequence number so the
 *    chain's order is deterministic on both backends.
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID, randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";

import {
  bindParam,
  dialect,
  isPostgres,
  toPgPlaceholders,
  type Dialect,
} from "./dialect";

export { dialect, isPostgres };
export type { Dialect };

export const DATA_DIR = join(process.cwd(), "data");

/**
 * Resolve the SQLite database file path.
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

/* ------------------------------------------------------------------ */
/* SQLite handle                                                       */
/* ------------------------------------------------------------------ */

interface SqliteStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): unknown;
}

interface SqliteDatabase {
  prepare(sql: string): SqliteStatement;
  exec(sql: string): void;
  close(): void;
}

let _sqlite: SqliteDatabase | null = null;

/** Open (once) and return the shared SQLite handle. */
export function sqlite(): SqliteDatabase {
  if (_sqlite) return _sqlite;

  // Imported lazily so that a Postgres deployment never loads the SQLite driver,
  // and so the experimental-feature warning is not emitted when unused.
  const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");

  const path = dbPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const handle = new DatabaseSync(path);
  handle.exec("PRAGMA journal_mode = WAL");
  handle.exec("PRAGMA foreign_keys = ON");
  _sqlite = handle as unknown as SqliteDatabase;
  return _sqlite;
}

/* ------------------------------------------------------------------ */
/* Postgres pool                                                       */
/* ------------------------------------------------------------------ */

interface PgPool {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }>;
  end(): Promise<void>;
}

let _pool: PgPool | null = null;

/**
 * Open (once) and return the shared Postgres pool.
 *
 * The connection string is read at call time so tests can point at a different
 * database without import-order games. `max` is small: serverless functions are
 * short-lived and Neon's pooler multiplexes anyway, so a large pool per instance
 * would only exhaust connections.
 */
export function postgres(): PgPool {
  if (_pool) return _pool;

  const pg = require("pg") as typeof import("pg");
  const { Pool, types } = pg;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not set but the postgres dialect was selected.");

  // Postgres returns COUNT(*) as bigint, which node-postgres delivers as a STRING
  // to avoid precision loss. Every count in this application is a small integer
  // (rows in a demo database), and code throughout expects a number, so parse
  // int8 as a number. Without this, `typeof total === "number"` fails and
  // arithmetic silently concatenates.
  types.setTypeParser(types.builtins.INT8, (v: string) => Number.parseInt(v, 10));

  // NUMERIC (OID 1700) is also returned as a string. healthlink stores durations
  // as REAL, but a cast to NUMERIC anywhere would surface as a string, so parse it
  // too. Values here are measurements and hour counts, well within double range.
  types.setTypeParser(types.builtins.NUMERIC, (v: string) => Number.parseFloat(v));

  const pool = new Pool({
    connectionString: url,
    max: Number.parseInt(process.env.PGPOOL_MAX ?? "4", 10),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
    // Neon terminates connections that omit TLS.
    ssl: url.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
  });

  _pool = {
    query: (sql, params) => pool.query(sql, params as never) as never,
    end: () => pool.end(),
  };
  return _pool;
}

/** True when a handle has been opened (used by scripts to decide whether to close). */
export function isOpen(): boolean {
  return isPostgres() ? _pool !== null : _sqlite !== null;
}

/** Close whichever handle is open (used by scripts and tests). */
export async function closeDb(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
  if (_sqlite) {
    _sqlite.close();
    _sqlite = null;
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
  /**
   * Monotonic sequence number, used ONLY for ordering.
   *
   * The hash chain must link records in a deterministic order. Ordering by
   * occurred_at alone is ambiguous when two events share a millisecond, which
   * happens whenever one request writes a workflow event and an audit row
   * together. SQLite offered rowid as a tiebreaker; Postgres has none, so the
   * order is made explicit here instead of relying on storage internals.
   *
   * Allocated in application code (see nextAuditSeq) rather than by a database
   * sequence, so a back-dated seeder insert can be given a sequence consistent
   * with its position in time.
   */
  seq            INTEGER,
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
CREATE INDEX IF NOT EXISTS idx_audit_seq ON audit_events(seq);
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

/**
 * Create all tables if they do not exist, and apply additive column migrations.
 *
 * Safe to call repeatedly. Two concerns are handled:
 *
 *  1. A database created by an older build may be missing columns that later
 *     schema text adds (for example audit_events.seq). `CREATE TABLE IF NOT
 *     EXISTS` does not alter an existing table, and an index on a missing column
 *     would fail, so additive columns are added explicitly first.
 *
 *  2. Postgres has no multi-statement exec over the pooled protocol, so the
 *     schema is split into statements and issued in order.
 */
export async function migrate(): Promise<void> {
  if (isPostgres()) {
    // Additive migrations first, so the schema's index statements can succeed.
    // Each is guarded on the table's existence, because on a brand-new database
    // the table has not been created yet — `ALTER TABLE ... ADD COLUMN IF NOT
    // EXISTS` still fails if the table itself is missing.
    for (const m of ADDITIVE_MIGRATIONS) {
      if (!(await tableExistsPostgres(m.table))) continue;
      await postgres().query(`ALTER TABLE ${m.table} ADD COLUMN IF NOT EXISTS ${m.column} ${m.sqlType}`);
    }
    for (const s of splitStatements(SCHEMA_SQL)) {
      await postgres().query(s);
    }
    return;
  }

  const handle = sqlite();

  // SQLite has no `ADD COLUMN IF NOT EXISTS`, so check the column list first.
  for (const m of ADDITIVE_MIGRATIONS) {
    if (!tableExistsSqlite(handle, m.table)) continue;
    if (columnExistsSqlite(handle, m.table, m.column)) continue;
    handle.exec(`ALTER TABLE ${m.table} ADD COLUMN ${m.column} ${m.sqlType}`);
  }

  handle.exec(SCHEMA_SQL);
}

/** Is a table present in the current Postgres schema? */
async function tableExistsPostgres(table: string): Promise<boolean> {
  const row = await postgres().query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1",
    [table],
  );
  return row.rows.length > 0;
}

/**
 * Columns added after the first release. Each is nullable, so applying it to an
 * existing database cannot break existing rows.
 */
const ADDITIVE_MIGRATIONS: Array<{ table: string; column: string; sqlType: string }> = [
  { table: "audit_events", column: "seq", sqlType: "INTEGER" },
];

function tableExistsSqlite(handle: SqliteDatabase, table: string): boolean {
  const row = handle
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table) as { name?: string } | undefined;
  return !!row?.name;
}

function columnExistsSqlite(handle: SqliteDatabase, table: string, column: string): boolean {
  const rows = handle.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: string }>;
  return rows.some((r) => r.name === column);
}

/**
 * Split a DDL script into individual statements for Postgres.
 *
 * Naive `split(";")` would corrupt any statement containing a semicolon inside a
 * string literal or a comment, so this walks the text the same way the
 * placeholder rewriter does.
 */
function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let current = "";
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];

    if (ch === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") {
        current += sql[i];
        i++;
      }
      continue;
    }
    if (ch === "/" && sql[i + 1] === "*") {
      current += "/*";
      i += 2;
      while (i < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) {
        current += sql[i];
        i++;
      }
      current += "*/";
      i += 2;
      continue;
    }
    if (ch === "'") {
      current += ch;
      i++;
      while (i < sql.length) {
        current += sql[i];
        if (sql[i] === "'" && sql[i + 1] === "'") {
          current += "'";
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (ch === ";") {
      const trimmed = current.trim();
      if (trimmed) out.push(trimmed);
      current = "";
      i++;
      continue;
    }
    current += ch;
    i++;
  }

  const last = current.trim();
  if (last) out.push(last);
  return out;
}

/* ------------------------------------------------------------------ */
/* Query helpers                                                       */
/*                                                                     */
/* All async: Postgres is asynchronous over the network, so a synchronous */
/* façade would be a lie. Callers must await.                          */
/* ------------------------------------------------------------------ */

type Row = Record<string, unknown>;

/** Run a query and return all rows. */
export async function all<T = Row>(sql: string, ...params: unknown[]): Promise<T[]> {
  const bound = params.map(bindParam);

  if (isPostgres()) {
    const res = await postgres().query(applyDialect(sql), bound);
    return res.rows as T[];
  }

  const handle = sqlite();
  const { adaptSql } = sqliteAdapters(handle);
  return handle.prepare(adaptSql(sql)).all(...(bound as never[])) as T[];
}

/** Run a query and return the first row, or undefined. */
export async function get<T = Row>(sql: string, ...params: unknown[]): Promise<T | undefined> {
  const bound = params.map(bindParam);

  if (isPostgres()) {
    const res = await postgres().query(applyDialect(sql), bound);
    return res.rows[0] as T | undefined;
  }

  const handle = sqlite();
  const { adaptSql } = sqliteAdapters(handle);
  return handle.prepare(adaptSql(sql)).get(...(bound as never[])) as T | undefined;
}

/** Execute a statement. Returns the number of affected rows where known. */
export async function run(sql: string, ...params: unknown[]): Promise<{ changes: number }> {
  const bound = params.map(bindParam);

  if (isPostgres()) {
    const res = await postgres().query(applyDialect(sql), bound);
    return { changes: res.rowCount ?? 0 };
  }

  const handle = sqlite();
  const { adaptSql } = sqliteAdapters(handle);
  const result = handle.prepare(adaptSql(sql)).run(...(bound as never[])) as { changes?: number };
  return { changes: result.changes ?? 0 };
}

/** Execute a multi-statement script with no parameters. */
export async function exec(sql: string): Promise<void> {
  if (isPostgres()) {
    for (const s of splitStatements(sql)) {
      await postgres().query(applyDialect(s));
    }
    return;
  }
  sqlite().exec(sql);
}

/**
 * Insert a row from a plain object. Column names come from the object keys, so
 * placeholders can never drift out of step with the column list.
 */
export async function insert(table: string, record: Record<string, unknown>): Promise<void> {
  const cols = Object.keys(record);
  const placeholders = cols.map(() => "?").join(",");
  const sql = `INSERT INTO ${table} (${cols.join(",")}) VALUES (${placeholders})`;
  await run(sql, ...cols.map((c) => record[c]));
}

/** Update a row by primary key, from a plain object of changed columns. */
export async function update(
  table: string,
  idColumn: string,
  idValue: unknown,
  record: Record<string, unknown>,
): Promise<void> {
  const cols = Object.keys(record);
  if (!cols.length) return;
  const sql = `UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE ${idColumn} = ?`;
  await run(sql, ...cols.map((c) => record[c]), idValue);
}

/**
 * Rewrite statement text for the active dialect.
 *
 * `insert`/`update` build SQL from column names, never from user input, so table
 * and column identifiers are safe to interpolate. Values always travel as bound
 * parameters.
 */
function applyDialect(sql: string): string {
  return isPostgres() ? toPgPlaceholders(sql) : sql;
}

/**
 * SQLite shims for the few statements that differ.
 *
 * Only two rewrites are needed, both one-way (Postgres -> SQLite) and both
 * applied here so application SQL can be written once in the Postgres-compatible
 * form where the two differ.
 */
function sqliteAdapters(handle: SqliteDatabase): {
  adaptSql: (sql: string) => string;
} {
  void handle;
  return {
    adaptSql: (sql: string) => {
      // `COUNT(*)::int` is Postgres cast syntax; SQLite wants plain COUNT(*).
      // countExpr() emits it only for Postgres, so this is a safety net for any
      // hand-written query that includes the cast.
      return sql.replace(/COUNT\(\*\)::int/g, "COUNT(*)");
    },
  };
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
 * Allocate the next audit sequence number.
 *
 * Ordering for the hash chain is by `seq`, not by timestamp, so that two events
 * written in the same millisecond still have a definite order. For back-dated
 * seeding the sequence is derived from the target timestamp so that a seeded row
 * lands in the right position relative to existing history.
 *
 * Concurrency: two simultaneous writers could read the same MAX(seq). The chain
 * tolerates that only if the order is consistent, so callers that write audit rows
 * concurrently should serialise on this. In practice every write path in
 * HealthLink is already inside a single request handler, and the seeded data is
 * written by one process.
 */
async function nextAuditSeq(occurredAt: string, backdated: boolean): Promise<number> {
  if (backdated) {
    const row = await get<{ n: number | null }>(
      "SELECT MAX(seq) AS n FROM audit_events WHERE occurred_at <= ?",
      occurredAt,
    );
    return (row?.n ?? 0) + 1;
  }
  const row = await get<{ n: number | null }>("SELECT MAX(seq) AS n FROM audit_events");
  return (row?.n ?? 0) + 1;
}

/**
 * Append an audit event. The table is hash-chained: each record stores the hash
 * of the previous record, so tampering or deletion is detectable.
 */
export async function writeAudit(input: AuditInput): Promise<string> {
  const id = newId("aud");
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const backdated = input.occurredAt !== undefined;

  const seq = await nextAuditSeq(occurredAt, backdated);

  // Chain onto whatever currently holds seq - 1, which is the record this one
  // follows in the canonical order.
  const prev = await get<{ record_hash: string | null }>(
    "SELECT record_hash FROM audit_events WHERE seq = ?",
    seq - 1,
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

  await run(
    `INSERT INTO audit_events (
       id, seq, occurred_at, action, event_type, event_subtype,
       actor_user_id, actor_name, actor_role, actor_facility,
       patient_id, referral_id, entity_type, entity_id,
       outcome, outcome_desc, purpose_code, description,
       ip_address, user_agent, network_type, fhir_audit_id,
       previous_hash, record_hash
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    row.id,
    seq,
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

/**
 * Verify the audit hash chain.
 *
 * Ordered by `seq`, which is the order the hashes were linked in. Ordering by
 * timestamp would be wrong when two events share a millisecond, and would report
 * a false break.
 */
export async function verifyAuditChain(): Promise<{
  intact: boolean;
  checked: number;
  brokenAt: string | null;
  reason?: string;
}> {
  const rows = await all<AuditableRecord>(
    "SELECT * FROM audit_events ORDER BY seq ASC",
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

export async function getSetting(key: string, fallback: string): Promise<string> {
  const row = await get<{ value: string }>("SELECT value FROM system_settings WHERE key = ?", key);
  return row?.value ?? fallback;
}

export async function setSetting(key: string, value: string, updatedBy?: string): Promise<void> {
  await run(
    `INSERT INTO system_settings (key, value, updated_at, updated_by)
     VALUES (?,?,?,?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    key,
    value,
    new Date().toISOString(),
    updatedBy ?? null,
  );
}
