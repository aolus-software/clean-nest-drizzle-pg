import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { ServeStaticModule } from "@nestjs/serve-static";
import { join } from "path";
import { AuthModule } from "./auth/auth.module";
import { HealthModule } from "./health/health.module";
import { SettingsModule } from "./settings/settings.module";

@Module({
	imports: [
		ServeStaticModule.forRoot({
			rootPath: join(__dirname, "..", "/storage/"),
		}),

		AuthModule,
		HealthModule,
		SettingsModule,
	],
	controllers: [AppController],
	providers: [],
})
export class AppModule {}
