import { index, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { users_table } from "./user.schema";
import { relations } from "drizzle-orm";

export const email_verifications_table = pgTable(
	"email_verifications",
	{
		id: uuid().primaryKey().defaultRandom(),
		user_id: uuid()
			.notNull()
			.references(() => users_table.id, { onDelete: "cascade" }),
		token: varchar({ length: 255 }).notNull().unique(),
		used_at: timestamp(),
		expired_at: timestamp().notNull(),
		created_at: timestamp().defaultNow(),
		updated_at: timestamp()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [index("email_verifications_token_index").on(table.token)],
);

export const email_verifications_relations = relations(
	email_verifications_table,
	({ one }) => ({
		user: one(users_table, {
			fields: [email_verifications_table.user_id],
			references: [users_table.id],
		}),
	}),
);
