import { Body, Controller, Patch, Res } from "@nestjs/common";
import {
	ApiStandardResponses,
	ApiSuccessResponse,
	CurrentUser,
	ResponseHandler,
} from "@common";
import type { UserInformation } from "@repositories";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { FastifyReply } from "fastify";
import { I18nService } from "nestjs-i18n";

import { ChangePasswordDto } from "./dto/change-password.dto";
import { ProfileService } from "./profile.service";

@Controller("profile")
@ApiTags("Profile")
@ApiBearerAuth("Bearer")
export class ProfileController {
	constructor(
		private readonly profileService: ProfileService,
		private readonly i18n: I18nService,
	) {}

	/* Authentication alone is the gate: a caller only ever changes their own
	   password, and proving the current one is the authorization. */
	@Patch("/password")
	@ApiSuccessResponse(200, "Password changed successfully", null)
	@ApiStandardResponses({
		forbidden: false,
	})
	async changePassword(
		@Body() data: ChangePasswordDto,
		@CurrentUser() user: UserInformation,
		@Res() res: FastifyReply,
	) {
		try {
			await this.profileService.changePassword(user.id, data);
			return res
				.status(200)
				.send(
					ResponseHandler.success(
						200,
						this.i18n.t("message.auth.change_password_success"),
						null,
					),
				);
		} catch (error) {
			ResponseHandler.handleError(res, error);
		}
	}
}
