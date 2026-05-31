import {
	Injectable,
	NotFoundException,
	UnprocessableEntityException,
} from "@nestjs/common";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import {
	db,
	email_verifications_table,
	password_reset_tokens_table,
	UserDetail,
	UserList,
	UserRepository,
	users_table,
} from "@repositories";
import { DatatableType, MailService, PaginationResponse } from "@common";
import { DateUtils, HashUtils, StrUtils } from "@utils";
import { UpdatePasswordDto } from "./dto/update-password.dto";
import { UpdateStatusDto } from "./dto/update-status.dto";
import { and, eq, isNull } from "drizzle-orm";
import { getEnv } from "@config";
import { emailVerificationLifetime } from "@utils/default/token-lifetime";
import { I18nService } from "nestjs-i18n";

@Injectable()
export class UsersService {
	constructor(
		private readonly mailService: MailService,
		private readonly i18n: I18nService,
	) {}

	async create(createUserDto: CreateUserDto): Promise<void> {
		const isEmailExist = await UserRepository().findByEmail(
			createUserDto.email,
		);
		if (isEmailExist) {
			throw new UnprocessableEntityException({
				message: this.i18n.t("message.user.email_exists"),
				error: {
					email: [this.i18n.t("message.user.email_exists")],
				},
			});
		}

		const password = await HashUtils.generateHash(createUserDto.password);
		await db.transaction(async (tx) => {
			const user = await tx
				.insert(users_table)
				.values({
					email: createUserDto.email,
					name: createUserDto.name,
					password: password,
					status: createUserDto.status,
				})
				.returning();

			if (user.length === 0) {
				throw new UnprocessableEntityException({
					message: this.i18n.t("message.user.not_created"),
					error: {
						email: [this.i18n.t("message.user.not_created")],
					},
				});
			}

			const token = StrUtils.random(255);
			await tx.insert(email_verifications_table).values({
				user_id: user[0].id,
				token,
				expired_at: DateUtils.addHours(DateUtils.now(), 2).toDate(),
			});

			// Send verification email
			await this.mailService.sendMail({
				subject: this.i18n.t("email.verify_email.subject"),
				to: createUserDto.email,
				template: "auth/verify-email",
				context: {
					name: createUserDto.name,
					verifyUrl: `${getEnv().FRONTEND_URL}/verify-email?token=${token}`,
				},
			});
		});
	}

	async resendVerificationEmail(id: string): Promise<void> {
		const user = await UserRepository()
			.getDb()
			.query.users.findFirst({
				where: and(eq(users_table.id, id), isNull(users_table.deleted_at)),
				columns: { id: true, name: true, email: true, email_verified_at: true },
			});

		if (!user) {
			return;
		}

		if (user.email_verified_at) {
			throw new UnprocessableEntityException({
				message: this.i18n.t("message.user.email_already_verified"),
				error: {
					email: [this.i18n.t("message.user.email_already_verified")],
				},
			});
		}

		const token = StrUtils.random(255);
		await db.insert(email_verifications_table).values({
			user_id: user.id,
			token,
			expired_at: emailVerificationLifetime,
		});

		await this.mailService.sendMail({
			subject: this.i18n.t("email.verify_email.subject"),
			to: user.email,
			template: "auth/verify-email",
			context: {
				name: user.name,
				verifyUrl: `${getEnv().FRONTEND_URL}/verify-email?token=${token}`,
			},
		});
	}

	async findAll(
		queryParam: DatatableType,
	): Promise<PaginationResponse<UserList>> {
		return await UserRepository().findAll(queryParam);
	}

	async getDetail(id: string): Promise<UserDetail> {
		const data = await UserRepository().getDetail(id);
		if (!data) {
			throw new NotFoundException(
				this.i18n.t("message.user.not_found", { args: { id } }),
			);
		}

		return data;
	}

	async update(id: string, updateUserDto: UpdateUserDto): Promise<void> {
		const data = await UserRepository().getDetail(id);
		if (!data) {
			throw new NotFoundException(
				this.i18n.t("message.user.not_found", { args: { id } }),
			);
		}

		const isEmailExist = await UserRepository().findByEmail(
			updateUserDto.email,
		);
		if (isEmailExist && isEmailExist.id !== id) {
			throw new UnprocessableEntityException({
				message: "Email already exists",
				error: {
					email: ["Email already exists"],
				},
			});
		}

		await db.transaction(async (tx) => {
			await tx
				.update(users_table)
				.set({
					id,
					email: updateUserDto.email,
					name: updateUserDto.name,
					status: updateUserDto.status,
				})
				.where(eq(users_table.id, id));
		});
	}

	async remove(id: string): Promise<void> {
		const data = await UserRepository().getDetail(id);
		if (!data) {
			throw new NotFoundException(
				this.i18n.t("message.user.not_found", { args: { id } }),
			);
		}

		await db.transaction(async (tx) => {
			await tx
				.update(users_table)
				.set({
					deleted_at: DateUtils.now().toDate(),
				})
				.where(eq(users_table.id, id));
		});
	}

	async updateStatus(id: string, data: UpdateStatusDto): Promise<void> {
		const user = await UserRepository().getDetail(id);
		if (!user) {
			throw new NotFoundException(
				this.i18n.t("message.user.not_found", { args: { id } }),
			);
		}

		await db.transaction(async (tx) => {
			await tx
				.update(users_table)
				.set({
					id,
					status: data.status,
				})
				.where(eq(users_table.id, id));
		});
	}

	async updatePassword(id: string, data: UpdatePasswordDto): Promise<void> {
		const user = await UserRepository().getDetail(id);
		if (!user) {
			throw new NotFoundException(
				this.i18n.t("message.user.not_found", { args: { id } }),
			);
		}

		const hashedPassword = await HashUtils.generateHash(data.newPassword);
		await db
			.update(users_table)
			.set({
				password: hashedPassword,
			})
			.where(eq(users_table.id, id));
	}

	async sendForgotPasswordEmail(id: string): Promise<void> {
		const user = await UserRepository().getDetail(id);
		if (!user) {
			return;
		}

		const token = StrUtils.random(255);
		await db.insert(password_reset_tokens_table).values({
			user_id: user.id,
			token,
			expired_at: DateUtils.addHours(DateUtils.now(), 2).toDate(),
		});

		await this.mailService.sendMail({
			subject: this.i18n.t("email.forgot_password.subject"),
			to: user.email,
			template: "auth/forgot-password",
			context: {
				name: user.name,
				resetUrl: `${getEnv().FRONTEND_URL}/reset-password?token=${token}`,
			},
		});
	}
}
