import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { CommonService } from "./common.service";
import { ThrottlerModule } from "./throttler/throttler.module";
import { CacheModule } from "./cache/cache.module";
import { MailModule } from "./mail/mail.module";
import { I18nModule } from "./i18n/i18n.module";
import { AuthStrategy } from "./strategies/auth.strategy";

@Module({
	providers: [CommonService, AuthStrategy],
	exports: [CommonService, AuthStrategy],
	imports: [
		PassportModule.register({ defaultStrategy: "jwt" }),
		ThrottlerModule,
		CacheModule,
		MailModule,
		I18nModule,
	],
})
export class CommonModule {}
