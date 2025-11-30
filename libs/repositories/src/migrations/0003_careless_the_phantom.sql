ALTER TABLE "password_reset_tokens" ADD COLUMN "expired_at" timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD COLUMN "used_at" timestamp;