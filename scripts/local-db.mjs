// Zero-install local Postgres for development (no Docker or system Postgres needed).
// Keeps running until Ctrl+C. Data lives in .local-db/, which git ignores.
import { existsSync } from "node:fs";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const databaseDir = join(process.cwd(), ".local-db");
const fresh = !existsSync(join(databaseDir, "PG_VERSION"));
const server = new EmbeddedPostgres({
  databaseDir,
  user: "postgres",
  password: "postgres",
  port: Number(process.env.LOCAL_DB_PORT || 5432),
  persistent: true,
});

if (fresh) await server.initialise();
await server.start();
if (fresh) await server.createDatabase("church_cms");
console.log(`Local Postgres ready: postgres://postgres:postgres@localhost:${process.env.LOCAL_DB_PORT || 5432}/church_cms`);

const stop = async () => {
  await server.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
