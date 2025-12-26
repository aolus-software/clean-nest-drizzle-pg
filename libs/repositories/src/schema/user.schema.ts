import { relations } from "drizzle-orm";
import {
	index,
	pgEnum,
	pgTable,
	timestamp,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";
import { email_verifications_table } from "./email-verification.schema";
import { user_roles_table } from "./rbac.schema";
import { password_reset_tokens_table } from "./reset-password-token.schema";

export type UserStatusEnum = "active" | "inactive" | "suspended" | "blocked";
export const UserStatusEnumArray: Array<UserStatusEnum> = [
	"active",
	"inactive",
	"suspended",
	"blocked",
];

export const user_status_enum = pgEnum("user_status", [
	"active",
	"inactive",
	"suspended",
	"blocked",
]);

export const users_table = pgTable(
	"users",
	{
		id: uuid().primaryKey().defaultRandom(),
		name: varchar({ length: 255 }).notNull(),
		email: varchar({ length: 255 }).notNull().unique(),
		status: user_status_enum().default("active"),
		remark: varchar({ length: 255 }),
		password: varchar({ length: 255 }).notNull(),
		email_verified_at: timestamp(),
		deleted_at: timestamp(),
		created_at: timestamp().defaultNow(),
		updated_at: timestamp()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("users_email_deleted_at_status_index").on(
			table.email,
			table.deleted_at,
			table.status,
		),
	],
);

export const users_relations = relations(users_table, ({ many }) => ({
	email_verifications: many(email_verifications_table),
	password_reset_tokens: many(password_reset_tokens_table),
	user_roles: many(user_roles_table),
}));
