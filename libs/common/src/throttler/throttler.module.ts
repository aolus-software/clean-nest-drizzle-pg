import { getEnv } from "@config";
import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import {
	ThrottlerModule as NodeThrottlerModule,
	seconds,
	ThrottlerGuard,
} from "@nestjs/throttler";

@Module({
	imports: [
		NodeThrottlerModule.forRoot({
			throttlers: [
				{
					ttl: seconds(getEnv().THROTTLER_TTL || 60),
					limit: Number(getEnv().THROTTLER_LIMIT) || 100,
				},
			],
		}),
	],
	providers: [
		{
			provide: APP_GUARD,
			useClass: ThrottlerGuard,
		},
	],
	exports: [ThrottlerModule],
})
export class ThrottlerModule {}
