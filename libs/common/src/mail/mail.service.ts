import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import { Queue } from "bullmq";
import { MailJobData } from "./mail.processor";
import { MailerService } from "@nestjs-modules/mailer";

@Injectable()
export class MailService {
	constructor(
		@InjectQueue("mail-queue") private readonly _mailQueue: Queue,
		private readonly _mailerService: MailerService,
	) {}

	async sendMail(options: MailJobData): Promise<void> {
		await this._mailQueue.add("sendMail", options);
	}

	async sendEmailSync(options: MailJobData): Promise<void> {
		await this._mailerService.sendMail(options);
	}
}
