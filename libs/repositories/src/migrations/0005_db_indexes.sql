DROP INDEX "email_verifications_token_index";--> statement-breakpoint
DROP INDEX "password_reset_tokens_token_index";--> statement-breakpoint
CREATE INDEX "users_created_at_live_index" ON "users" USING btree ("created_at") WHERE "users"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "email_verifications_user_id_used_at_index" ON "email_verifications" USING btree ("user_id","used_at");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_id_used_at_index" ON "password_reset_tokens" USING btree ("user_id","used_at");--> statement-breakpoint
CREATE INDEX "role_permissions_permission_id_index" ON "role_permissions" USING btree ("permission_id");--> statement-breakpoint
CREATE INDEX "user_roles_role_id_index" ON "user_roles" USING btree ("role_id");