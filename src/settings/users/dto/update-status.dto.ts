import { ApiProperty } from "@nestjs/swagger";
import { UserStatusEnum, UserStatusEnumArray } from "@repositories";
import { IsNotEmpty, IsEnum } from "class-validator";
import { i18nValidationMessage } from "nestjs-i18n";
export class UpdateStatusDto {
	@IsNotEmpty({ message: i18nValidationMessage("validation.NOT_EMPTY") })
	@IsEnum(UserStatusEnumArray, {
		message: i18nValidationMessage("validation.IS_ENUM"),
	})
	@ApiProperty({
		example: UserStatusEnumArray,
		description: "The status of the user",
		enum: UserStatusEnumArray,
	})
	status: UserStatusEnum;
}
