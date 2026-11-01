import { Injectable, UnprocessableEntityException } from "@nestjs/common";
import { db, users_table } from "@repositories";
import { HashUtils } from "@utils";
import { CacheService } from "@common";
import { and, eq, isNull } from "drizzle-orm";
import { I18nService } from "nestjs-i18n";

import { ChangePasswordDto } from "./dto/change-password.dto";

@Injectable()
export class ProfileService {
	constructor(
		private readonly cacheService: CacheService,
		private readonly i18n: I18nService,
	) {}

	/* Changes the caller's own password after verifying the current one. A
	   wrong current password is a 422 on `currentPassword`. On success the
	   stored refresh-token id and the cached user information are dropped, so
	   every refresh token issued before the change is rejected. */
	async changePassword(userId: string, data: ChangePasswordDto): Promise<void> {
		const user: { id: string; password: string } | undefined =
			await db.query.users.findFirst({
				where: and(eq(users_table.id, userId), isNull(users_table.deleted_at)),
				columns: { id: true, password: true },
			});

		const isPasswordValid: boolean = user
			? await HashUtils.compareHash(data.currentPassword, user.password)
			: false;

		if (!user || !isPasswordValid) {
			throw new UnprocessableEntityException({
				message: this.i18n.t("message.auth.current_password_invalid"),
				error: {
					currentPassword: [
						this.i18n.t("message.auth.current_password_invalid"),
					],
				},
			});
		}

		const hashedPassword = await HashUtils.generateHash(data.newPassword);
		await db
			.update(users_table)
			.set({ password: hashedPassword })
			.where(eq(users_table.id, userId));

		await this.cacheService.revokeSession(userId);
	}
}
