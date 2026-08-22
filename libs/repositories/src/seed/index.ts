/* Loaded first and by the entry point, matching src/main.ts and
   drizzle.config.ts: the `db` singleton in @repositories reads
   getEnv().DATABASE_URL at module load, so .env must already be in
   process.env by the time that import is evaluated. */
import "dotenv/config";

import { db } from "@repositories";
import { LoggerUtils } from "@utils";
import { seedPermissions } from "./permission.seed";
import { seedRoles } from "./role.seed";
import { seedUsers } from "./user.seed";

/* Order matters: roles grant the permissions seeded before them, and users are
   assigned the roles seeded before them. */
async function seed(): Promise<void> {
	await seedPermissions(db);
	await seedRoles(db);
	await seedUsers(db);
}

seed()
	.then(() => {
		LoggerUtils.info("Seeding completed.");
		process.exit(0);
	})
	.catch((error: unknown) => {
		LoggerUtils.error("Seeding failed.", error);
		process.exit(1);
	});
