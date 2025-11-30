import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { ServeStaticModule } from "@nestjs/serve-static";
import { join } from "path";
import { AuthModule } from "./auth/auth.module";

@Module({
	imports: [
		ServeStaticModule.forRoot({
			rootPath: join(__dirname, "..", "/storage/"),
		}),
		AuthModule,
	],
	controllers: [AppController],
	providers: [],
})
export class AppModule {}
