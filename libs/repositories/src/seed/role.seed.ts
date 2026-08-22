import {
	DbTransaction,
	permissions_table,
	role_permissions_table,
	roles_table,
} from "@repositories";
import { LoggerUtils } from "@utils";
import { eq } from "drizzle-orm";

/* Seeds the three baseline roles and grants the full permission catalogue to
   the two privileged ones. `user` is left with no permissions deliberately —
   it is the shape a self-registered account gets. Every insert relies on a
   unique or composite primary key, so the whole function is re-runnable. */
export async function seedRoles(database: DbTransaction): Promise<void> {
	const roleNames = ["superuser", "admin", "user"];
	const privilegedRoles = ["superuser", "admin"];

	for (const name of roleNames) {
		await database.insert(roles_table).values({ name }).onConflictDoNothing();

		if (!privilegedRoles.includes(name)) {
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

		const permissions = await database
			.select({ id: permissions_table.id })
			.from(permissions_table);

		for (const permission of permissions) {
			await database
				.insert(role_permissions_table)
				.values({ role_id: role.id, permission_id: permission.id })
				.onConflictDoNothing();
		}
	}

	LoggerUtils.info("Role seeding completed.");
}
