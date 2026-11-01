import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, IsStrongPassword } from "class-validator";
import { i18nValidationMessage } from "nestjs-i18n";

export class ChangePasswordDto {
	@IsString({ message: i18nValidationMessage("validation.IS_STRING") })
	@IsNotEmpty({ message: i18nValidationMessage("validation.NOT_EMPTY") })
	@ApiProperty({
		description: "The user's current password",
		example: "currentPassword123!",
		type: String,
		format: "password",
	})
	currentPassword: string;

	@IsString({ message: i18nValidationMessage("validation.IS_STRING") })
	@IsNotEmpty({ message: i18nValidationMessage("validation.NOT_EMPTY") })
	@IsStrongPassword(
		{},
		{ message: i18nValidationMessage("validation.IS_STRONG_PASSWORD") },
	)
	@ApiProperty({
		description: "New password for the user",
		example: "strongPassword123!",
		type: String,
		format: "password",
	})
	newPassword: string;
}
