import { Module } from "@nestjs/common";
import { MailService } from "./mail.service";
import { MailerModule } from "@nestjs-modules/mailer";
import { HandlebarsAdapter } from "@nestjs-modules/mailer/adapters/handlebars.adapter";
import { BullModule } from "@nestjs/bullmq";
import { join } from "path";
import { MailProcessor } from "./mail.processor";
import { getEnv } from "@config";

@Module({
	providers: [MailService, MailProcessor],
	imports: [
		MailerModule.forRootAsync({
			useFactory: () => ({
				transport: {
					host: getEnv().MAIL_HOST,
					port: getEnv().MAIL_PORT,
					secure: getEnv().MAIL_SECURE,
					auth: {
						user: getEnv().MAIL_USERNAME,
						pass: getEnv().MAIL_PASSWORD,
					},
				},
				defaults: {
					from: getEnv().MAIL_FROM,
				},

				template: {
					dir: join(
						process.cwd(),
						"libs",
						"common",
						"src",
						"mail",
						"templates",
					),
					adapter: new HandlebarsAdapter(),
					options: {
						strict: true,
					},
				},
			}),
		}),

		BullModule.registerQueue({
			name: "mail-queue",
			connection: {
				host: getEnv().REDIS_HOST,
				port: getEnv().REDIS_PORT,
				password: getEnv().REDIS_PASSWORD,
			},
			/* Without attempts, BullMQ tries once: a transient SMTP failure or a
			   provider rate limit permanently drops a verification or reset
			   email, and the user simply never receives it. */
			defaultJobOptions: {
				attempts: 3,
				backoff: { type: "exponential", delay: 2000 },
				removeOnComplete: 100,
				removeOnFail: 500,
			},
		}),
	],

	exports: [MailService],
})
export class MailModule {}
