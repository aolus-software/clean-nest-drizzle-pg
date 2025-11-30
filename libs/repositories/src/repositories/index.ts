import { schema } from "@repositories/schema";
import { ExtractTablesWithRelations } from "drizzle-orm";
import { PgTransaction } from "drizzle-orm/pg-core";
import { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";

export type DbTransaction = PgTransaction<
	PostgresJsQueryResultHKT,
	typeof schema,
	ExtractTablesWithRelations<typeof schema>
>;

export * from "./user.repository";
