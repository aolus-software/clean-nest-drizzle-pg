export * from "./repositories.module";
export * from "./repositories.service";
export * from "./schema";
export * from "./repositories/index";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { schema } from "./schema/index";

const connectionString = process.env.DATABASE_URL!;
const client = new Pool({ connectionString });

const db = drizzle(client, {
	schema: schema,
});

export { db };
