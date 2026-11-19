/** True for a SQLite UNIQUE constraint failure (not a primary key clash). */
function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === "SQLITE_CONSTRAINT_UNIQUE";
}

/** Runs `write`; a UNIQUE constraint failure is replaced by `onDuplicate()`, anything else is rethrown. */
export function onUniqueViolation<T>(write: () => T, onDuplicate: () => Error): T {
  try {
    return write();
  } catch (err) {
    if (isUniqueViolation(err)) throw onDuplicate();
    throw err;
  }
}
