import {
	DbTransaction,
	roles_table,
	user_roles_table,
	users_table,
} from "@repositories";
import { DateUtils, HashUtils, LoggerUtils } from "@utils";
import { eq } from "drizzle-orm";

/* Seeds one pre-verified account per baseline role, each holding the role of
   the same name. Existing accounts are skipped rather than updated, so a
   re-run never rewrites a password an operator has since changed. */
export async function seedUsers(database: DbTransaction): Promise<void> {
	const userNames = ["superuser", "admin", "user"];

	for (const name of userNames) {
		const email = `${name}@example.com`;

		const [existingUser] = await database
			.select({ id: users_table.id })
			.from(users_table)
			.where(eq(users_table.email, email))
			.limit(1);

		if (existingUser) {
			continue;
		}

		const [user] = await database
			.insert(users_table)
			.values({
				name,
				email,
				password: await HashUtils.generateHash("S3crEtP4ssw0rd!"),
				email_verified_at: DateUtils.now().toDate(),
				status: "active",
			})
			.returning({ id: users_table.id });

		if (!user) {
			continue;
		}

		const [role] = await database
			.select({ id: roles_table.id })
			.from(roles_table)
			.where(eq(roles_table.name, name))
			.limit(1);

		if (!role) {
			continue;
		}

		await database
			.insert(user_roles_table)
			.values({ user_id: user.id, role_id: role.id })
			.onConflictDoNothing();
	}

	LoggerUtils.info("User seeding completed.");
}
