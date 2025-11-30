ALTER TABLE "email_verifications" DROP CONSTRAINT "email_verifications_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "password_reset_tokens" DROP CONSTRAINT "password_reset_tokens_user_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "email_verification_token_index";--> statement-breakpoint
DROP INDEX "password_reset_token_token_index";--> statement-breakpoint
ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_verifications_token_index" ON "email_verifications" USING btree ("token");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_token_index" ON "password_reset_tokens" USING btree ("token");--> statement-breakpoint
ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_token_unique" UNIQUE("token");--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE("email");