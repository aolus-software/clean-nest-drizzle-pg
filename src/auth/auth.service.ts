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
import { and, eq, isNotNull } from "drizzle-orm";

@Injectable()
export class AuthService {
	constructor(
		private readonly cacheService: CacheService,
		private readonly mailService: MailService,
	) {}

	async login(data: LoginDto): Promise<{
		user: UserInformation;
		accessToken: string;
		refreshToken: string;
	}> {
		const user = await UserRepository().findByEmail(data.email);
		if (!user) {
			throw new UnprocessableEntityException({
				message: "Invalid email or password",
				error: {
					email: ["Invalid email or password"],
				},
			});
		}

		if (!user.email_verified_at) {
			throw new UnprocessableEntityException({
				message: "Please verify your email to proceed",
				error: {
					email: ["Please verify your email to proceed"],
				},
			});
		}

		if (user.status !== "active") {
			throw new UnprocessableEntityException({
				message: "Your account is not active",
				error: {
					email: ["Your account is not active"],
				},
			});
		}

		const isPasswordValid = await HashUtils.compareHash(
			data.password,
			user.password,
		);
		if (!isPasswordValid) {
			throw new UnprocessableEntityException({
				message: "Invalid email or password",
				error: {
					email: ["Invalid email or password"],
				},
			});
		}

		// Clear any existing cache for the user
		await this.cacheService.del(UserCache(user.id));
		const userInformation = await UserRepository().UserInformation(user.id);
		if (!userInformation) {
			throw new UnprocessableEntityException({
				message: "User information could not be retrieved",
				error: {
					user: ["User information could not be retrieved"],
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
				message: "Email already in use",
				error: {
					email: ["Email already in use"],
				},
			});
		}

		if (isEmailExist && isEmailExist.email_verified_at === null) {
			throw new UnprocessableEntityException({
				message: "Please verify your email to complete registration",
				error: {
					email: ["Please verify your email to complete registration"],
				},
			});
		}

		const hashedPassword = await HashUtils.generateHash(data.password);
		await db.transaction(async (tx) => {
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
					message: "Registration failed",
					error: {
						user: ["Registration failed"],
					},
				});
			}

			const token = StrUtils.random(255);
			await tx.insert(email_verifications_table).values({
				user_id: newUser[0].id,
				token: token,
				expired_at: DateUtils.addHours(DateUtils.now(), 2).toDate(),
			});

			await this.mailService.sendMail({
				subject: "Verify your email address",
				to: data.email,
				template: "auth/verify-email",
				context: {
					name: data.name,
					verifyUrl: `${process.env.FRONTEND_URL}/verify-email?token=${token}`,
				},
			});
		});
	}

	async resendVerificationEmail(
		data: ResendEmailVerificationDto,
	): Promise<void> {
		const user = await UserRepository().findByEmail(data.email);
		if (!user) {
			return;
		}

		if (user.email_verified_at) {
			throw new UnprocessableEntityException({
				message: "Email is already verified",
				error: {
					email: ["Email is already verified"],
				},
			});
		}

		const token = StrUtils.random(255);
		await db.transaction(async (tx) => {
			await tx.insert(email_verifications_table).values({
				user_id: user.id,
				token: token,
				expired_at: DateUtils.addHours(DateUtils.now(), 2).toDate(),
			});

			await this.mailService.sendMail({
				subject: "Verify your email address",
				to: user.email,
				template: "auth/verify-email",
				context: {
					name: user.name,
					verifyUrl: `${process.env.FRONTEND_URL}/verify-email?token=${token}`,
				},
			});
		});
	}

	async verifyEmail(data: EmailVerificationDto): Promise<void> {
		const emailVerification = await db.query.email_verifications.findFirst({
			where: and(
				eq(email_verifications_table.token, data.token),
				isNotNull(email_verifications_table.used_at),
			),
		});

		if (!emailVerification) {
			throw new UnprocessableEntityException({
				message: "Invalid or expired verification token",
				error: {
					token: ["Invalid or expired verification token"],
				},
			});
		}

		const now = DateUtils.now();
		const expiredAt = DateUtils.parse(
			emailVerification.expired_at.toISOString(),
		);

		if (now.isAfter(expiredAt)) {
			throw new UnprocessableEntityException({
				message: "Invalid or expired verification token",
				error: {
					token: ["Invalid or expired verification token"],
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

		if (!user.email_verified_at) {
			throw new UnprocessableEntityException({
				message: "Please verify your email to proceed",
				error: {
					email: ["Please verify your email to proceed"],
				},
			});
		}

		const token = StrUtils.random(255);
		await db.transaction(async (tx) => {
			await tx.insert(password_reset_tokens_table).values({
				user_id: user.id,
				token: token,
				expired_at: DateUtils.addHours(DateUtils.now(), 2).toDate(),
			});

			await this.mailService.sendMail({
				to: user.email,
				subject: "Reset your password",
				template: "auth/forgot-password",
				context: {
					name: user.name,
					resetUrl: `${process.env.FRONTEND_URL}/reset-password?token=${token}`,
				},
			});
		});
	}

	async isResetPasswordTokenValid(
		data: ResetPasswordTokenValidationDto,
	): Promise<boolean> {
		const resetPassword = await db.query.password_reset_tokens.findFirst({
			where: and(
				eq(password_reset_tokens_table.token, data.token),
				isNotNull(password_reset_tokens_table.used_at),
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
				isNotNull(password_reset_tokens_table.used_at),
			),
		});

		if (!resetPassword) {
			throw new UnprocessableEntityException({
				message: "Invalid or expired reset token",
				error: {
					token: ["Invalid or expired reset token"],
				},
			});
		}

		if (resetPassword.used_at) {
			throw new UnprocessableEntityException({
				message: "Invalid or expired reset token",
				error: {
					token: ["Invalid or expired reset token"],
				},
			});
		}

		const now = DateUtils.now();
		const expiredAt = DateUtils.parse(resetPassword.expired_at.toISOString());

		if (now.isAfter(expiredAt)) {
			throw new UnprocessableEntityException({
				message: "Invalid or expired reset token",
				error: {
					token: ["Invalid or expired reset token"],
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
