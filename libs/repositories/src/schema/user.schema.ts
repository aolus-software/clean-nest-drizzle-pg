import { relations, sql } from "drizzle-orm";
import {
	index,
	uniqueIndex,
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
		email: varchar({ length: 255 }).notNull(),
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
		/* Uniqueness among LIVE users only. A plain unique constraint on email
		   cannot see deleted_at, so it kept a soft-deleted user's address
		   reserved forever: the service check (which does filter deleted_at)
		   said the address was free, the constraint disagreed, and the insert
		   surfaced as a 500. Scoping the index to deleted_at IS NULL keeps the
		   database-level guarantee for live rows and lets a deleted user's
		   address be reused, which is what soft delete is for. */
		uniqueIndex("users_email_unique_live")
			.on(table.email)
			.where(sql`${table.deleted_at} is null`),
	],
);

export const users_relations = relations(users_table, ({ many }) => ({
	email_verifications: many(email_verifications_table),
	password_reset_tokens: many(password_reset_tokens_table),
	user_roles: many(user_roles_table),
}));
