import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
	const app = await NestFactory.create(AppModule);

	const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGINS?.split(",") ?? [
		"http://localhost:3000",
	];
	const ALLOWED_METHODS = process.env.ALLOWED_METHODS?.split(",") ?? [
		"GET",
		"POST",
		"PUT",
		"DELETE",
		"OPTIONS",
	];
	const ALLOWED_HEADERS = process.env.ALLOWED_HEADERS?.split(",") ?? [
		"Content-Type",
		"Authorization",
	];

	app.enableCors({
		origin: ALLOWED_ORIGIN,
		methods: ALLOWED_METHODS,
		allowedHeaders: ALLOWED_HEADERS,
		maxAge: 0,
		credentials: false,
	});

	const APP_PORT = process.env.APP_PORT ?? 8001;
	await app.listen(APP_PORT);
}
bootstrap()
	.then(() => {
		console.log(
			`Application is running on: http://localhost:${process.env.APP_PORT ?? 8001}`,
		);
	})
	.catch((err) => {
		console.error("Error during app bootstrap:", err);
		process.exit(1);
	});
