import { index, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { users_table } from "./user.schema";
import { relations } from "drizzle-orm";

export const password_reset_tokens_table = pgTable(
	"password_reset_tokens",
	{
		id: uuid().primaryKey().defaultRandom(),
		user_id: uuid()
			.notNull()
			.references(() => users_table.id, { onDelete: "cascade" }),
		token: varchar({ length: 255 }).notNull().unique(),
		expired_at: timestamp().notNull(),
		used_at: timestamp(),
		created_at: timestamp().defaultNow(),
		updated_at: timestamp()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [index("password_reset_tokens_token_index").on(table.token)],
);

export const password_reset_tokens_relations = relations(
	password_reset_tokens_table,
	({ one }) => ({
		user: one(users_table, {
			fields: [password_reset_tokens_table.user_id],
			references: [users_table.id],
		}),
	}),
);
