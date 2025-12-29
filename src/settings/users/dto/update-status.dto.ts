import { ApiProperty } from "@nestjs/swagger";
import { UserStatusEnum, UserStatusEnumArray } from "@repositories";
import { IsNotEmpty, IsEnum } from "class-validator";
export class UpdateStatusDto {
	@IsNotEmpty()
	@IsEnum(UserStatusEnumArray)
	@ApiProperty({
		example: UserStatusEnumArray,
		description: "The status of the user",
		enum: UserStatusEnumArray,
	})
	status: UserStatusEnum;
}
