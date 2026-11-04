import { Pool, PoolClient, types } from "pg";

// Keep DATE columns as plain YYYY-MM-DD strings so a server timezone can never shift them.
types.setTypeParser(1082, (value) => value);
// bigint counts as numbers.
types.setTypeParser(20, (value) => Number(value));

declare global {
  // eslint-disable-next-line no-var
  var __cmsPool: Pool | undefined;
}

function pool(): Pool {
  if (!globalThis.__cmsPool) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    const url = process.env.DATABASE_URL;
    const isLocal = /localhost|127\.0\.0\.1/.test(url);
    globalThis.__cmsPool = new Pool({
      connectionString: url,
      max: Number(process.env.DATABASE_POOL_MAX || 5),
      ssl: isLocal ? undefined : { rejectUnauthorized: false },
    });
    // Hosted databases close idle connections. Without a listener, that crashes the process.
    globalThis.__cmsPool.on("error", (error) => console.error("Idle database connection closed:", error.message));
  }
  return globalThis.__cmsPool;
}

export type Tx = PoolClient;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Read-only query outside a transaction. Mutations must go through withTx. */
export async function query<T extends Row = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await pool().query<T>(text, params as never[]);
  return result.rows;
}

export async function one<T extends Row = Row>(text: string, params: unknown[] = []): Promise<T | null> {
  return (await query<T>(text, params))[0] ?? null;
}

/**
 * Runs a transaction with the audit actor set. The audit trigger reads app.actor,
 * so every row changed inside the callback is logged under that name.
 */
export async function withTx<T>(actor: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.actor', $1, true)", [actor]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function txRows<T extends Row = Row>(tx: Tx, text: string, params: unknown[] = []): Promise<T[]> {
  return (await tx.query<T>(text, params as never[])).rows;
}

export async function txOne<T extends Row = Row>(tx: Tx, text: string, params: unknown[] = []): Promise<T | null> {
  return (await txRows<T>(tx, text, params))[0] ?? null;
}

export async function closePool() {
  await globalThis.__cmsPool?.end();
  globalThis.__cmsPool = undefined;
}
