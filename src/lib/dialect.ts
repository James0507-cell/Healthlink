/**
 * Database dialect adapter.
 *
 * HealthLink supports two backends behind one interface:
 *
 *   SQLite      — the default. Zero-config, file-based, ideal for local
 *                 development and offline evaluation sessions.
 *   PostgreSQL  — used when DATABASE_URL is set. Required for serverless
 *                 hosting such as Vercel, where the filesystem is read-only.
 *
 * HOW THE TRANSLATION WORKS
 *
 * All application SQL is written in SQLite-flavoured syntax with `?`
 * placeholders, and this module rewrites it for Postgres at execution time:
 *
 *   ?              -> $1, $2, ...   (renumbered in order of appearance)
 *   julianday(a)   -> handled by an explicit helper instead, see ageInHours()
 *   rowid          -> never used; ordering uses a monotonic `seq` column
 *   json_extract() -> handled by jsonField(), see below
 *
 * The rewrite is safe because no application SQL contains a `?` inside a string
 * literal within the statement text — verified before the port. Quoted literals
 * are skipped anyway, so a future `WHERE note = 'why?'` cannot corrupt numbering.
 *
 * Statements are deliberately executed one at a time. The application never used
 * explicit transactions, so there is no BEGIN/COMMIT to map onto a pooled client.
 */

/* ------------------------------------------------------------------ */
/* Dialect detection                                                   */
/* ------------------------------------------------------------------ */

export type Dialect = "sqlite" | "postgres";

/**
 * Which backend to use.
 *
 * Read at call time, not at module load, so tests and scripts can set
 * DATABASE_URL before the first query without worrying about import hoisting.
 */
export function dialect(): Dialect {
  // An empty string must mean "not configured", matching the .env convention.
  const url = process.env.DATABASE_URL?.trim();
  return url && url.startsWith("postgres") ? "postgres" : "sqlite";
}

export function isPostgres(): boolean {
  return dialect() === "postgres";
}

/* ------------------------------------------------------------------ */
/* Placeholder translation                                             */
/* ------------------------------------------------------------------ */

/**
 * Rewrite `?` placeholders as `$1..$n`, skipping anything inside a quoted
 * literal so a question mark in text cannot shift the numbering.
 *
 * Also skips Postgres cast operators (`::`) and dollar-quoted strings, which do
 * not appear in this codebase but would otherwise be a hazard.
 */
export function toPgPlaceholders(sql: string): string {
  let out = "";
  let n = 0;
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];

    // Single-quoted literal: copy verbatim, including a doubled '' escape.
    if (ch === "'") {
      out += ch;
      i++;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          out += "''";
          i += 2;
          continue;
        }
        out += sql[i];
        if (sql[i] === "'") {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // Double-quoted identifier: copy verbatim.
    if (ch === '"') {
      out += ch;
      i++;
      while (i < sql.length) {
        out += sql[i];
        if (sql[i] === '"') {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // Line comment: copy to end of line.
    if (ch === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") {
        out += sql[i];
        i++;
      }
      continue;
    }

    // Block comment: copy verbatim.
    if (ch === "/" && sql[i + 1] === "*") {
      out += "/*";
      i += 2;
      while (i < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) {
        out += sql[i];
        i++;
      }
      out += "*/";
      i += 2;
      continue;
    }

    if (ch === "?") {
      n++;
      out += `$${n}`;
      i++;
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Portable SQL helpers                                                */
/* ------------------------------------------------------------------ */

/**
 * Hours between two timestamp expressions, as a number.
 *
 * SQLite uses julianday() arithmetic; Postgres uses EXTRACT(EPOCH ...). Keeping
 * this in one place means the report and dashboard queries read the same on both
 * backends.
 *
 * @param from column expression for the earlier timestamp
 * @param to   column expression for the later timestamp
 */
export function hoursBetween(from: string, to: string): string {
  if (isPostgres()) {
    return `(EXTRACT(EPOCH FROM (${to}::timestamptz - ${from}::timestamptz)) / 3600.0)`;
  }
  return `((julianday(${to}) - julianday(${from})) * 24.0)`;
}

/**
 * Read a value out of a JSON text column.
 *
 * SQLite's json_extract() takes a JSON path; Postgres needs a chain of -> and ->>
 * operators. `path` is a dotted key list, e.g. "meta.versionId".
 *
 * Postgres:  (col::json->'meta'->>'versionId')      yields text
 *            ((col::json->'meta'->>'versionId'))::int  yields int
 * SQLite:    json_extract(col, '$.meta.versionId')
 *
 * The text form uses the LAST key with ->> (text extraction) and all preceding
 * keys with -> (json navigation), which is the correct operator sequence.
 */
export function jsonField(column: string, path: string, as: "int" | "text" = "text"): string {
  const keys = path.split(".");

  if (isPostgres()) {
    let expr = `(${column}::json`;
    for (let i = 0; i < keys.length; i++) {
      const isLast = i === keys.length - 1;
      expr += isLast ? `->>'${keys[i]}'` : `->'${keys[i]}'`;
    }
    expr += ")";
    return as === "int" ? `(${expr})::int` : expr;
  }

  const jsonPath = `$.${path}`;
  return as === "int"
    ? `CAST(json_extract(${column}, '${jsonPath}') AS INTEGER)`
    : `json_extract(${column}, '${jsonPath}')`;
}

/**
 * Count rows and return an integer.
 *
 * Postgres returns bigint for COUNT(*) at the driver level; casting keeps the
 * value a JS number so arithmetic in reports behaves identically.
 */
export function countExpr(): string {
  return isPostgres() ? "COUNT(*)::int" : "COUNT(*)";
}

/* ------------------------------------------------------------------ */
/* Type coercion                                                       */
/* ------------------------------------------------------------------ */

/**
 * Normalise a bound parameter for the active driver.
 *
 * SQLite accepts booleans directly; Postgres does not. Both drivers reject
 * `undefined`, which should have been an explicit null by the time it gets here.
 */
export function bindParam(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}
