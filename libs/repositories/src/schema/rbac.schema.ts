import { relations } from "drizzle-orm";
import {
	pgTable,
	uuid,
	varchar,
	primaryKey,
	timestamp,
} from "drizzle-orm/pg-core";
import { users_table } from "./user.schema";

export const roles_table = pgTable("roles", {
	id: uuid().defaultRandom().primaryKey(),
	name: varchar({ length: 100 }).notNull().unique(),
	created_at: timestamp().defaultNow().notNull(),
	updated_at: timestamp().defaultNow().notNull(),
});

export const roles_relations = relations(roles_table, ({ many }) => ({
	role_permissions: many(role_permissions_table),
	user_roles: many(user_roles_table),
}));

export const permissions_table = pgTable("permissions", {
	id: uuid().defaultRandom().primaryKey(),
	name: varchar({ length: 255 }).notNull().unique(),
	group: varchar({ length: 100 }).notNull(),
	created_at: timestamp().defaultNow().notNull(),
	updated_at: timestamp().defaultNow().notNull(),
});

export const permissions_relations = relations(
	permissions_table,
	({ many }) => ({
		role_permissions: many(role_permissions_table),
	}),
);

export const role_permissions_table = pgTable(
	"role_permissions",
	{
		role_id: uuid()
			.notNull()
			.references(() => roles_table.id, { onDelete: "cascade" }),
		permission_id: uuid()
			.notNull()
			.references(() => permissions_table.id, { onDelete: "cascade" }),
	},
	(table) => ({
		pk: primaryKey({ columns: [table.role_id, table.permission_id] }),
	}),
);

export const role_permissions_relations = relations(
	role_permissions_table,
	({ one }) => ({
		role: one(roles_table, {
			fields: [role_permissions_table.role_id],
			references: [roles_table.id],
		}),
		permission: one(permissions_table, {
			fields: [role_permissions_table.permission_id],
			references: [permissions_table.id],
		}),
	}),
);

export const user_roles_table = pgTable(
	"user_roles",
	{
		user_id: uuid()
			.notNull()
			.references(() => users_table.id, { onDelete: "cascade" }),
		role_id: uuid()
			.notNull()
			.references(() => roles_table.id, { onDelete: "cascade" }),
		assigned_at: timestamp().defaultNow().notNull(),
	},
	(table) => ({
		pk: primaryKey({ columns: [table.user_id, table.role_id] }),
	}),
);

export const user_roles_relations = relations(user_roles_table, ({ one }) => ({
	user: one(users_table, {
		fields: [user_roles_table.user_id],
		references: [users_table.id],
	}),
	role: one(roles_table, {
		fields: [user_roles_table.role_id],
		references: [roles_table.id],
	}),
}));

export type Role = typeof roles_table.$inferSelect;
export type Permission = typeof permissions_table.$inferSelect;
export type RolePermission = typeof role_permissions_table.$inferSelect;
export type UserRole = typeof user_roles_table.$inferSelect;

export type InsertRole = typeof roles_table.$inferInsert;
export type InsertPermission = typeof permissions_table.$inferInsert;
export type InsertRolePermission = typeof role_permissions_table.$inferInsert;
export type InsertUserRole = typeof user_roles_table.$inferInsert;
