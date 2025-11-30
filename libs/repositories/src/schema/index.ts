export * from "./email-verification.schema";
export * from "./reset-password-token.schema";
export * from "./rbac.schema";
export * from "./user.schema";

import {
	email_verifications_table,
	email_verifications_relations,
} from "./email-verification.schema";
import {
	password_reset_tokens_table,
	password_reset_tokens_relations,
} from "./reset-password-token.schema";
import {
	roles_table,
	roles_relations,
	permissions_table,
	permissions_relations,
	role_permissions_table,
	role_permissions_relations,
	user_roles_table,
	user_roles_relations,
} from "./rbac.schema";
import { users_table, users_relations } from "./user.schema";

export const schema = {
	// Tables
	users: users_table,
	roles: roles_table,
	permissions: permissions_table,
	role_permissions: role_permissions_table,
	user_roles: user_roles_table,
	email_verifications: email_verifications_table,
	password_reset_tokens: password_reset_tokens_table,

	// Relations
	users_relations,
	roles_relations,
	permissions_relations,
	role_permissions_relations,
	user_roles_relations,
	email_verifications_relations,
	password_reset_tokens_relations,
};
