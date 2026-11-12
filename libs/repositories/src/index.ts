export * from "./repositories.module";
export * from "./repositories.service";
export * from "./schema";
export * from "./repositories/index";

import { drizzle } from "drizzle-orm/node-postgres";
import type { Logger } from "drizzle-orm";
import { Pool } from "pg";
import { schema } from "./schema/index";
import { getEnv } from "@config";
import { LoggerUtils } from "@utils";

/* Debug-level SQL log behind DB_LOG_QUERIES. Only the statement text and the
   parameter count are written: parameters carry password hashes and tokens. */
class QueryLogger implements Logger {
	logQuery(query: string, params: unknown[]): void {
		LoggerUtils.debug("db query", { query, paramCount: params.length });
	}
}

const client = new Pool({
	connectionString: getEnv().DATABASE_URL,
	max: getEnv().DB_POOL_MAX,
	idleTimeoutMillis: getEnv().DB_POOL_IDLE_TIMEOUT_MS,
	connectionTimeoutMillis: getEnv().DB_POOL_CONNECTION_TIMEOUT_MS,
});

/* An idle client that loses its connection emits "error" on the pool; with no
   listener Node treats it as unhandled and the process exits. */
client.on("error", (error: Error): void => {
	LoggerUtils.error("Idle PostgreSQL client error", error);
});

const db = drizzle(client, {
	schema: schema,
	logger: getEnv().DB_LOG_QUERIES ? new QueryLogger() : false,
});

export { db };
