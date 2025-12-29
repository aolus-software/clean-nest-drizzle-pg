import { Module } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { CacheModule, MailModule } from "@common";

@Module({
	controllers: [AuthController],
	providers: [AuthService],
	imports: [CacheModule, MailModule],
})
export class AuthModule {}
