import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { PassportModule } from "@nestjs/passport";
import { CommonService } from "./common.service";
import { ThrottlerModule } from "./throttler/throttler.module";
import { CacheModule } from "./cache/cache.module";
import { MailModule } from "./mail/mail.module";
import { I18nModule } from "./i18n/i18n.module";
import { AuthStrategy } from "./strategies/auth.strategy";
import { AuthGuard } from "./guards/auth/auth.guard";
import { PermissionGuard } from "./guards/permission/permission.guard";
import { RoleGuard } from "./guards/role/role.guard";

@Module({
	/* Guard order is the registration order, and it is load-bearing: AuthGuard
	   must populate request.user before the two RBAC guards read it. Registering
	   them globally means a new controller is protected by default — a route
	   opts out with @Public(), never by omission. */
	providers: [
		CommonService,
		AuthStrategy,
		{ provide: APP_GUARD, useClass: AuthGuard },
		{ provide: APP_GUARD, useClass: PermissionGuard },
		{ provide: APP_GUARD, useClass: RoleGuard },
	],
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
