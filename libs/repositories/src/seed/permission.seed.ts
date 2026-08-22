import { DbTransaction, permissions_table } from "@repositories";
import { LoggerUtils } from "@utils";

/* Seeds the permission catalogue as the cross product of resource groups and
   actions, producing the `entity:action` names the @PermissionAuth decorators
   reference. `permissions.name` is unique, so onConflictDoNothing makes a
   re-run a no-op instead of a constraint violation. */
export async function seedPermissions(database: DbTransaction): Promise<void> {
	const groups = ["user", "role", "permission"];
	const actions = ["list", "create", "view", "update", "delete", "restore"];

	for (const group of groups) {
		for (const action of actions) {
			await database
				.insert(permissions_table)
				.values({ name: `${group}:${action}`, group })
				.onConflictDoNothing();
		}
	}

	LoggerUtils.info("Permission seeding completed.");
}
