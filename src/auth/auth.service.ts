import { Injectable, UnprocessableEntityException } from "@nestjs/common";
import {
	db,
	email_verifications_table,
	password_reset_tokens_table,
	UserInformation,
	UserRepository,
	users_table,
} from "@repositories";
import { DateUtils, HashUtils, JWTUtils, StrUtils } from "@utils";
import { CacheService, MailService, UserCache } from "@common";

import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { ResendEmailVerificationDto } from "./dto/resend-email-verification.dto";
import { EmailVerificationDto } from "./dto/email-verification.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { ResetPasswordTokenValidationDto } from "./dto/reset-password-token-validation.dto";
import { and, eq, isNull } from "drizzle-orm";
import { getEnv } from "@config";
import {
	emailVerificationLifetime,
	resetPasswordLifetime,
} from "@utils/default/token-lifetime";
import { I18nService } from "nestjs-i18n";

/* A real bcrypt hash of a value nobody holds. Compared against when the email
   does not resolve, purely so the failed-login path costs the same either way. */
const TIMING_EQUALISER_HASH =
	"$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

@Injectable()
export class AuthService {
	constructor(
		private readonly cacheService: CacheService,
		private readonly mailService: MailService,
		private readonly i18n: I18nService,
	) {}

	async login(data: LoginDto): Promise<{
		user: UserInformation;
		accessToken: string;
		refreshToken: string;
	}> {
		const user = await UserRepository().findByEmail(data.email);

		/* Verify the password before looking at account state, and answer an
		   unknown address and a wrong password with the same message. Checking
		   "is this email verified" first would let an unauthenticated caller
		   tell a registered address from an unknown one without ever holding a
		   valid password. The dummy comparison keeps the response time for an
		   unknown address in line with a real one, so timing does not leak what
		   the message no longer does. */
		const isPasswordValid = user
			? await HashUtils.compareHash(data.password, user.password)
			: await HashUtils.compareHash(data.password, TIMING_EQUALISER_HASH);

		if (!user || !isPasswordValid) {
			throw new UnprocessableEntityException({
				message: this.i18n.t("message.auth.invalid_credentials"),
				error: {
					email: [this.i18n.t("message.auth.invalid_credentials")],
				},
			});
		}

		if (!user.email_verified_at) {
			throw new UnprocessableEntityException({
				message: this.i18n.t("message.auth.verify_email_required"),
				error: {
					email: [this.i18n.t("message.auth.verify_email_required")],
				},
			});
		}

		if (user.status !== "active") {
			throw new UnprocessableEntityException({
				message: this.i18n.t("message.auth.account_inactive"),
				error: {
					email: [this.i18n.t("message.auth.account_inactive")],
				},
			});
		}

		// Clear any existing cache for the user
		await this.cacheService.del(UserCache(user.id));
		const userInformation = await UserRepository().UserInformation(user.id);
		if (!userInformation) {
			throw new UnprocessableEntityException({
				message: this.i18n.t("message.auth.user_info_failed"),
				error: {
					user: [this.i18n.t("message.auth.user_info_failed")],
				},
			});
		}

		await this.cacheService.set<UserInformation>(
			UserCache(user.id),
			userInformation,
			null,
		);

		const accessToken = JWTUtils.generateAccessToken({ sub: user.id });
		const refreshToken = JWTUtils.generateRefreshToken({ sub: user.id });

		return {
			user: userInformation,
			accessToken,
			refreshToken,
		};
	}

	async register(data: RegisterDto) {
		const isEmailExist = await UserRepository().findByEmail(data.email);
		if (isEmailExist && isEmailExist.email_verified_at !== null) {
			throw new UnprocessableEntityException({
				message: this.i18n.t("message.auth.email_in_use"),
				error: {
					email: [this.i18n.t("message.auth.email_in_use")],
				},
			});
		}

		if (isEmailExist && isEmailExist.email_verified_at === null) {
			throw new UnprocessableEntityException({
				message: this.i18n.t("message.auth.verify_to_complete"),
				error: {
					email: [this.i18n.t("message.auth.verify_to_complete")],
				},
			});
		}

		const hashedPassword = await HashUtils.generateHash(data.password);

		/* The mail is enqueued only after the transaction commits. Redis and
		   Postgres share no transaction, so enqueuing inside the callback lets
		   the worker send a verification link whose token row is not committed
		   yet — or send one at all for a registration that rolled back. */
		const token = await db.transaction(async (tx) => {
			const newUser = await UserRepository()
				.getDb(tx)
				.insert(users_table)
				.values({
					name: data.name,
					email: data.email,
					password: hashedPassword,
				})
				.returning();

			if (newUser.length === 0) {
				throw new UnprocessableEntityException({
					message: this.i18n.t("message.auth.registration_failed"),
					error: {
						user: [this.i18n.t("message.auth.registration_failed")],
					},
				});
			}

			const verificationToken = StrUtils.random(255);
			await tx.insert(email_verifications_table).values({
				user_id: newUser[0].id,
				token: verificationToken,
				expired_at: emailVerificationLifetime(),
			});

			return verificationToken;
		});

		await this.mailService.sendMail({
			subject: this.i18n.t("email.verify_email.subject"),
			to: data.email,
			template: "auth/verify-email",
			context: {
				name: data.name,
				verifyUrl: `${getEnv().FRONTEND_URL}/verify-email?token=${token}`,
			},
		});
	}

	async resendVerificationEmail(
		data: ResendEmailVerificationDto,
	): Promise<void> {
		const user = await UserRepository().findByEmail(data.email);
		if (!user) {
			return;
		}

		/* Already verified: return as though the mail was sent. Throwing here
		   would tell an unauthenticated caller that the address is registered
		   and verified, which is exactly what the silent branch above exists to
		   prevent. */
		if (user.email_verified_at) {
			return;
		}

		const token = StrUtils.random(255);

		/* Enqueued after the write commits — see the note in register(). */
		await db.transaction(async (tx) => {
			await tx.insert(email_verifications_table).values({
				user_id: user.id,
				token: token,
				expired_at: emailVerificationLifetime(),
			});
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

	async verifyEmail(data: EmailVerificationDto): Promise<void> {
		const emailVerification = await db.query.email_verifications.findFirst({
			where: and(
				eq(email_verifications_table.token, data.token),
				isNull(email_verifications_table.used_at),
			),
		});

		if (!emailVerification) {
			throw new UnprocessableEntityException({
				message: this.i18n.t("message.auth.invalid_verification_token"),
				error: {
					token: [this.i18n.t("message.auth.invalid_verification_token")],
				},
			});
		}

		const now = DateUtils.now();
		const expiredAt = DateUtils.parse(
			emailVerification.expired_at.toISOString(),
		);

		if (now.isAfter(expiredAt)) {
			throw new UnprocessableEntityException({
				message: this.i18n.t("message.auth.invalid_verification_token"),
				error: {
					token: [this.i18n.t("message.auth.invalid_verification_token")],
				},
			});
		}

		await db.transaction(async (tx) => {
			await tx
				.update(users_table)
				.set({
					email_verified_at: DateUtils.now().toDate(),
				})
				.where(eq(users_table.id, emailVerification.user_id));

			await tx
				.update(email_verifications_table)
				.set({
					used_at: DateUtils.now().toDate(),
				})
				.where(eq(email_verifications_table.id, emailVerification.id));
		});
	}

	async forgotPassword(data: ForgotPasswordDto) {
		const user = await UserRepository().findByEmail(data.email);
		if (!user) {
			return;
		}

		/* Not yet verified: return silently rather than throwing. A distinct
		   error here would reveal that the address is registered — the same
		   disclosure the unknown-address branch above avoids. (This also
		   removes the one hardcoded English string in this service.) */
		if (!user.email_verified_at) {
			return;
		}

		const token = StrUtils.random(255);

		/* Enqueued after the write commits — see the note in register(). */
		await db.transaction(async (tx) => {
			await tx.insert(password_reset_tokens_table).values({
				user_id: user.id,
				token: token,
				expired_at: resetPasswordLifetime(),
			});
		});

		await this.mailService.sendMail({
			to: user.email,
			subject: this.i18n.t("email.forgot_password.subject"),
			template: "auth/forgot-password",
			context: {
				name: user.name,
				resetUrl: `${getEnv().FRONTEND_URL}/reset-password?token=${token}`,
			},
		});
	}

	async isResetPasswordTokenValid(
		data: ResetPasswordTokenValidationDto,
	): Promise<boolean> {
		const resetPassword = await db.query.password_reset_tokens.findFirst({
			where: and(
				eq(password_reset_tokens_table.token, data.token),
				isNull(password_reset_tokens_table.used_at),
			),
		});

		if (!resetPassword) {
			return false;
		}

		if (resetPassword.used_at) {
			return false;
		}

		const now = DateUtils.now();
		const expiredAt = DateUtils.parse(resetPassword.expired_at.toISOString());
		if (now.isAfter(expiredAt)) {
			return false;
		}

		return true;
	}

	async resetPassword(data: ResetPasswordDto) {
		const resetPassword = await db.query.password_reset_tokens.findFirst({
			where: and(
				eq(password_reset_tokens_table.token, data.token),
				isNull(password_reset_tokens_table.used_at),
			),
		});

		if (!resetPassword) {
			throw new UnprocessableEntityException({
				message: this.i18n.t("message.auth.invalid_reset_token"),
				error: {
					token: [this.i18n.t("message.auth.invalid_reset_token")],
				},
			});
		}

		if (resetPassword.used_at) {
			throw new UnprocessableEntityException({
				message: this.i18n.t("message.auth.invalid_reset_token"),
				error: {
					token: [this.i18n.t("message.auth.invalid_reset_token")],
				},
			});
		}

		const now = DateUtils.now();
		const expiredAt = DateUtils.parse(resetPassword.expired_at.toISOString());

		if (now.isAfter(expiredAt)) {
			throw new UnprocessableEntityException({
				message: this.i18n.t("message.auth.invalid_reset_token"),
				error: {
					token: [this.i18n.t("message.auth.invalid_reset_token")],
				},
			});
		}

		const hashedPassword = await HashUtils.generateHash(data.password);
		await db.transaction(async (tx) => {
			await tx
				.update(users_table)
				.set({ password: hashedPassword })
				.where(eq(users_table.id, resetPassword.user_id));

			await tx
				.update(password_reset_tokens_table)
				.set({ used_at: DateUtils.now().toDate() })
				.where(eq(password_reset_tokens_table.id, resetPassword.id));
		});
	}
}
